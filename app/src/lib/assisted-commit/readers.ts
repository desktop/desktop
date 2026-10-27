import { Repository } from '../../models/repository'
import { WorkingDirectoryFileChange } from '../../models/status'
import { ChangesSelectionKind } from '../app-state'
import { assistedCommitErrorCauses } from '../assisted-commit-run'
import { ErrorWithMetadata } from '../error-with-metadata'
import { IStatusResult } from '../git'
import { AssistedCommitError } from '../git/assisted-commit'
import {
  getAssistedCommitProtectedPaths,
  isRepositoryGitPaused,
  protectAssistedCommitResources,
  withRepositoryGitErrorPropagation,
  withRepositoryGitOperation,
} from '../git/repository-operation'
import { updateChangedFiles } from '../stores/updates/changes-state'
import { AssistedCommitContext } from './context'
import { AssistedCommitSelection } from './selection'
import { updateWorkingDirectorySelectionDiff } from './selection-display'
import { AssistedCommitState } from './state'
import {
  createAssistedCommitSettlement,
  IAssistedCommitConfiguration,
  IAssistedCommitRepository,
  IAssistedCommitRun,
  IAssistedCommitSettlement,
} from './types'

/** Owns associated readers, deferred refresh delivery and manual selection consumption. */
export class AssistedCommitReaders {
  private readonly deferredRefreshes = new Map<number, Repository>()
  private readonly deferredHistory = new Map<number, Repository>()
  private readonly historyReaders = new Set<number>()
  private readonly manualSettlements = new Map<
    number,
    {
      readonly repositoryPath: string
      readonly settlement: IAssistedCommitSettlement
    }
  >()

  public constructor(
    private readonly state: AssistedCommitState,
    private readonly selections: AssistedCommitSelection,
    private readonly context: AssistedCommitContext,
    private readonly repository: IAssistedCommitRepository,
    private readonly configuration: () => IAssistedCommitConfiguration
  ) {}

  /** Take one coalesced refresh without losing its newest repository metadata. */
  public takeRefresh(repository: Repository): Repository | undefined {
    const deferred = this.deferredRefreshes.get(repository.id)
    this.deferredRefreshes.delete(repository.id)
    return deferred
  }

  /** History selection delivery waits for the exact run's complete lifetime. */
  public async loadHistory(repository: Repository): Promise<void> {
    const run = this.state.runs.get(repository.id)
    if (run !== undefined && (!run.finished || run.lease !== undefined)) {
      this.deferredHistory.set(repository.id, repository)
    } else {
      this.deferredHistory.delete(repository.id)
      await this.repository.loadHistory(repository)
    }
  }

  /** A native manual commit must settle before a reader reuses restored masks. */
  public beginManual(
    repository: Repository,
    files: ReadonlyArray<WorkingDirectoryFileChange>
  ): void {
    if (files.some(file => this.selections.hasRestored(file.selection))) {
      this.manualSettlements.set(repository.id, {
        repositoryPath: repository.path,
        settlement: createAssistedCommitSettlement(),
      })
    }
  }

  /** Track associated readers without granting observers native mutation access. */
  public async read<T>(
    repository: Repository,
    run: IAssistedCommitRun | undefined,
    operation: () => Promise<T>
  ): Promise<T> {
    const manual = this.manualSettlements.get(repository.id)
    if (manual?.repositoryPath === repository.path) {
      await manual.settlement.done
      return this.read(repository, run, operation)
    }
    const state = this.state.cache.get(repository)
    if (
      run === undefined &&
      !state.changesState.workingDirectory.files.some(file =>
        this.selections.hasRestored(file.selection)
      )
    ) {
      return operation()
    }
    const readers = this.state.selectionReaders.get(repository.id) ?? {
      pending: new Set<Promise<void>>(),
      wasCommitting: state.isCommitting,
    }
    let complete: () => void = () => {}
    const done = new Promise<void>(resolve => {
      complete = resolve
    })
    const protection = protectAssistedCommitResources(repository.path)
    readers.pending.add(done)
    run?.selectionReaders.add(done)
    this.state.selectionReaders.set(repository.id, readers)
    this.state.cache.update(repository, () => ({ isCommitting: true }))
    this.state.updateErrorSettlement(repository)
    try {
      this.state.events.changed()
      return await withRepositoryGitOperation(repository.path, 'read', () =>
        withRepositoryGitErrorPropagation(operation)
      )
    } catch (error) {
      this.invalidate(repository, run, error)
      throw error
    } finally {
      readers.pending.delete(done)
      run?.selectionReaders.delete(done)
      complete()
      protection.release()
      if (readers.pending.size === 0) {
        this.state.selectionReaders.delete(repository.id)
        if (!readers.wasCommitting) {
          this.state.cache.update(repository, () => ({
            isCommitting: false,
          }))
        }
      }
      this.state.updateErrorSettlement(repository)
      this.state.events.changed()
    }
  }

  /** Exclude unverifiable masks and retain reader failure on the exact live owner. */
  public invalidate(
    repository: Repository,
    run: IAssistedCommitRun | undefined,
    error: unknown
  ): void {
    this.state.cache.updateChangesState(repository, state => ({
      workingDirectory: state.workingDirectory.withIncludeAllFiles(false),
      selection:
        state.selection.kind === ChangesSelectionKind.WorkingDirectory
          ? { ...state.selection, diff: null }
          : state.selection,
    }))
    if (run !== undefined && this.state.runs.get(repository.id) === run) {
      const state = this.state.cache.get(repository).changesState.assistedCommit
      const cause =
        state.kind === 'error'
          ? assistedCommitErrorCauses(state.error).includes(error)
            ? state.error
            : new AggregateError(
                [state.error, error],
                'Assisted commit selection refresh failed'
              )
          : error
      run.selectionReadError = cause
      this.state.fail(run, cause, 'refresh', true, false)
    } else {
      this.state.events.error(
        new ErrorWithMetadata(
          error instanceof Error
            ? error
            : new Error('Could not verify restored assisted selections', {
                cause: error,
              }),
          { repository }
        )
      )
    }
  }

  /** Drain every admitted selection reader before sealing the run's settlement. */
  public async finish(run: IAssistedCommitRun): Promise<void> {
    try {
      await this.updateDiff(run.repository)
      do {
        while (run.selectionReaders.size > 0) {
          await Promise.all([...run.selectionReaders])
        }
        if (!run.finalized && run.selectionFence !== undefined) {
          await withRepositoryGitOperation(run.repository.path, 'read', () =>
            this.selections.verifyFence(run)
          )
        }
      } while (run.selectionReaders.size > 0)
      run.selectionReadersClosed = true
    } catch (error) {
      this.invalidate(run.repository, run, error)
      while (run.selectionReaders.size > 0) {
        await Promise.all([...run.selectionReaders])
      }
      run.selectionReadersClosed = true
    }
  }

  /** Deliver deferred history once; failed visualization retains its request. */
  public async resumeHistory(
    repository: Repository
  ): Promise<ErrorWithMetadata | undefined> {
    const deferred = this.deferredHistory.get(repository.id)
    const assisted = this.state.runs.get(repository.id)
    if (
      deferred === undefined ||
      this.historyReaders.has(repository.id) ||
      (assisted !== undefined &&
        (!assisted.finished || assisted.lease !== undefined))
    ) {
      return
    }
    this.historyReaders.add(repository.id)
    try {
      await withRepositoryGitOperation(deferred.path, 'read', () =>
        withRepositoryGitErrorPropagation(() =>
          this.repository.loadHistory(deferred)
        )
      )
      if (this.deferredHistory.get(repository.id) === deferred) {
        this.deferredHistory.delete(repository.id)
      }
      return undefined
    } catch (error) {
      const metadata = new ErrorWithMetadata(
        error instanceof Error
          ? error
          : new Error('Could not load deferred History', { cause: error }),
        { repository: deferred }
      )
      try {
        this.state.events.error(metadata)
      } catch (notificationError) {
        throw new AggregateError(
          [metadata, notificationError],
          'Desktop could not present the deferred History error'
        )
      }
      return metadata
    } finally {
      this.historyReaders.delete(repository.id)
    }
  }

  /** Coalesce refreshes while retaining the newest repository metadata identity. */
  public deferRefresh(repository: Repository): void {
    const selected = this.configuration().selectedRepository
    const latest =
      selected instanceof Repository &&
      selected.id === repository.id &&
      selected.path === repository.path
        ? selected
        : repository
    const run = this.state.runs.get(repository.id)
    if (
      run !== undefined &&
      run.repository.path === latest.path &&
      run.repository.hash !== latest.hash
    ) {
      this.state.cache.transferState(run.repository, latest)
    }
    this.deferredRefreshes.set(repository.id, latest)
  }

  /** Release the exact manual staging consumer before allowing selection readers. */
  public finishManual(repository: Repository): void {
    const manual = this.manualSettlements.get(repository.id)
    if (manual?.repositoryPath === repository.path) {
      this.manualSettlements.delete(repository.id)
      manual.settlement.complete()
    }
  }

  /** Associate status reads before waiting and retain their exclusion policy. */
  public async loadStatus(
    repository: Repository,
    clearPartialState: boolean,
    propagateErrors: boolean,
    load: () => Promise<IStatusResult | null>,
    publish: (status: IStatusResult) => Promise<void>,
    excludeNewFiles: boolean = false
  ): Promise<IStatusResult | null> {
    const currentRun = this.state.selectionOwner(repository)
    if (currentRun?.selectionReadersClosed && !currentRun.finished) {
      await currentRun.settlement.done
      return this.loadStatus(
        repository,
        clearPartialState,
        propagateErrors,
        load,
        publish,
        true
      )
    }
    const assistedRun = currentRun
    return this.read(repository, assistedRun, () =>
      withRepositoryGitOperation(repository.path, 'read', () =>
        this.loadStatusCore(
          repository,
          clearPartialState && !excludeNewFiles,
          propagateErrors,
          assistedRun,
          excludeNewFiles,
          load,
          publish
        )
      )
    )
  }

  private async loadStatusCore(
    repository: Repository,
    clearPartialState: boolean,
    propagateErrors: boolean,
    assistedRun: IAssistedCommitRun | undefined,
    excludeNewFiles: boolean,
    load: () => Promise<IStatusResult | null>,
    publish: (status: IStatusResult) => Promise<void>
  ): Promise<IStatusResult | null> {
    const status = await load()

    if (status === null) {
      return null
    }
    await getAssistedCommitProtectedPaths(repository.path)
    try {
      await this.selections.verifyRestored(repository)
    } catch (error) {
      if (
        error instanceof AssistedCommitError &&
        error.code === 'selection-changed'
      ) {
        this.invalidate(repository, assistedRun, error)
        if (propagateErrors) {
          throw error
        }
        return status
      }
      throw error
    }
    if (assistedRun?.selectionFence !== undefined) {
      const currentRun = this.state.runs.get(repository.id)
      if (currentRun !== undefined && currentRun !== assistedRun) {
        return status
      }
      try {
        await this.selections.verifyFence(assistedRun)
      } catch (error) {
        this.invalidate(repository, assistedRun, error)
        return status
      }
    }
    const assistedCommitAvailable = await this.context.isAvailable(repository)
    this.state.cache.updateChangesState(repository, () => ({
      assistedCommitAvailable,
    }))

    this.state.cache.updateChangesState(repository, state => {
      const fresh =
        !excludeNewFiles &&
        assistedRun?.snapshot === undefined &&
        !state.workingDirectory.files.some(file =>
          this.selections.hasRestored(file.selection)
        )
          ? status
          : {
              ...status,
              workingDirectory:
                status.workingDirectory.withIncludeAllFiles(false),
            }
      return updateChangedFiles(state, fresh, clearPartialState)
    })

    await publish(status)
    await this.updateDiff(repository)
    if (assistedRun?.selectionFence !== undefined) {
      try {
        await this.selections.verifyFence(assistedRun)
      } catch (error) {
        this.invalidate(repository, assistedRun, error)
      }
    }

    return status
  }

  /** Delay display refreshes while the engine owns selection. */
  public async updateDiff(repository: Repository): Promise<void> {
    const run = this.state.selectionOwner(repository)
    if (run?.selectionReadersClosed && !run.finished) {
      await run.settlement.done
      return this.updateDiff(repository)
    }
    if (
      isRepositoryGitPaused(repository.path) ||
      (run?.snapshot !== undefined &&
        !run.finished &&
        !run.reconciling &&
        !run.finalized &&
        run.result === undefined)
    ) {
      this.deferRefresh(repository)
      return
    }
    return this.read(repository, run, () =>
      withRepositoryGitOperation(repository.path, 'read', () =>
        this.updateDiffCore(repository)
      )
    )
  }

  private async updateDiffCore(repository: Repository): Promise<void> {
    const result = await updateWorkingDirectorySelectionDiff(
      repository,
      this.state,
      this.selections,
      this.configuration().hideWhitespace
    )
    if (result.kind === 'invalid') {
      this.invalidate(repository, result.run, result.error)
    } else if (result.kind === 'updated') {
      this.state.events.changed()
    }
  }
}
