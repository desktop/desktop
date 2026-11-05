import { AssistedCommitPushError } from '../git/assisted-commit-push'
import {
  AssistedCommitRunState,
  isAssistedCommitRepositoryLocked,
} from '../../models/assisted-commit-run'
import { CloningRepository } from '../../models/cloning-repository'
import { IAssistedCommitIntent } from '../../models/copilot-assisted-commit'
import { Repository } from '../../models/repository'
import { assistedCommitErrorCauses } from '../assisted-commit-run'
import { ErrorWithMetadata } from '../error-with-metadata'
import { AssistedCommitError } from '../git/assisted-commit'
import {
  assertRepositoryGitAvailable,
  assertRepositoryGitDestructionAvailable,
  canonicalMutationPath,
  getAssistedCommitProtectedPaths,
  hasRepositoryGitOperationAccess,
  protectAssistedCommitResources,
  repositoryPathsOverlap,
  withRepositoryGitDestruction,
} from '../git/repository-operation'
import { RepositoryStateCache } from '../stores/repository-state-cache'
import {
  IAssistedCommitEvents,
  IAssistedCommitPreparedIntent,
  IAssistedCommitRun,
} from './types'

/** Feature-owned run identities, UI publication and retained resource obligations. */
export class AssistedCommitState {
  /** Internal native owners; not reconstructed from presentation state. */
  public readonly runs = new Map<number, IAssistedCommitRun>()
  /** Prepared requests are weak capabilities, never serialized UI input. */
  public readonly intents = new WeakMap<
    IAssistedCommitIntent,
    IAssistedCommitPreparedIntent
  >()
  /** Reader obligations outlive errors and the native Git lease. */
  public readonly selectionReaders = new Map<
    number,
    { readonly pending: Set<Promise<void>>; readonly wasCommitting: boolean }
  >()

  public constructor(
    public readonly cache: RepositoryStateCache,
    public readonly events: IAssistedCommitEvents
  ) {}

  /** Find the run owning selection, excluding settled presentation-only errors. */
  public selectionOwner(
    repository: Repository
  ): IAssistedCommitRun | undefined {
    const run = this.runs.get(repository.id)
    const state = this.cache.get(repository).changesState.assistedCommit
    return run?.repository.path === repository.path &&
      (!run.finished || (state.kind === 'error' && state.retry !== null))
      ? run
      : undefined
  }

  /** Publish only while the exact run still owns this repository. */
  public set(
    run: IAssistedCommitRun,
    assistedCommit: AssistedCommitRunState
  ): void {
    if (this.runs.get(run.repository.id) !== run) {
      throw new AssistedCommitError(
        'disposed',
        'Assisted commit run was replaced'
      )
    }
    this.cache.updateChangesState(run.repository, () => ({
      assistedCommit,
    }))
    this.events.changed()
  }

  /** Preserve all original causes and required recovery in the inline error. */
  public fail(
    run: IAssistedCommitRun,
    error: unknown,
    retry: 'recovery' | 'refresh' | null,
    selectionNeedsReview: boolean,
    notify: boolean = true
  ): ErrorWithMetadata {
    const existing = this.cache.get(run.repository).changesState.assistedCommit
    if (existing.kind === 'push-error' && run.finalized) {
      return this.failPush(
        run,
        new Error(existing.error.message, {
          cause: new AggregateError([existing.error, error]),
        })
      )
    }
    const preserved =
      existing.kind !== 'error'
        ? error
        : assistedCommitErrorCauses(error).includes(existing.error)
        ? error
        : assistedCommitErrorCauses(existing.error).includes(error)
        ? existing.error
        : new AggregateError(
            [existing.error, error],
            'Assisted commit run needs attention'
          )
    const metadata = new ErrorWithMetadata(
      preserved instanceof Error
        ? preserved
        : new Error('Assisted commit failed', { cause: preserved }),
      {
        repository: run.repository,
        gitContext: { kind: 'commit' },
      }
    )
    log.error('Assisted commit run failed', metadata)
    const state: AssistedCommitRunState = {
      kind: 'error',
      runId: run.id,
      error: metadata,
      recovery: run.recovery,
      pushed: run.pushSucceeded === true,
      retry: run.pushPublicationPending
        ? 'refresh'
        : run.finalized &&
          assistedCommitErrorCauses(error).some(
            cause =>
              cause instanceof AssistedCommitPushError && cause.publicationStale
          )
        ? null
        : retry,
      selectionNeedsReview,
      settling: !run.finished,
    }
    if (notify) {
      this.set(run, state)
    } else {
      this.cache.updateChangesState(run.repository, () => ({
        assistedCommit: state,
      }))
    }
    return metadata
  }

  /** Error publication never implies that native ownership has settled. */
  public updateErrorSettlement(repository: Repository): void {
    const run = this.runs.get(repository.id)
    const state = this.cache.get(repository).changesState.assistedCommit
    if (
      run !== undefined &&
      (state.kind === 'error' || state.kind === 'push-error') &&
      state.runId === run.id
    ) {
      this.cache.updateChangesState(repository, () => ({
        assistedCommit: {
          ...state,
          settling:
            !run.finished ||
            (run.lease === undefined &&
              this.selectionReaders.has(repository.id)),
        },
      }))
    }
  }

  /** Release physical protection only after execution, recovery and readers settle. */
  public releaseResources(run: IAssistedCommitRun): void {
    if (
      run.finished &&
      !isAssistedCommitRepositoryLocked(
        this.cache.get(run.repository).changesState.assistedCommit
      ) &&
      !this.selectionReaders.has(run.repository.id)
    ) {
      run.resourceProtection?.release()
      run.resourceProtection = undefined
    }
  }

  /** Extend physical protection without a gap between old and new dependencies. */
  public protect(run: IAssistedCommitRun, paths: ReadonlyArray<string>): void {
    run.protectedPaths = [
      ...new Set([
        ...(run.protectedPaths ?? []),
        ...paths,
        ...(run.pushDestination?.kind === 'configured'
          ? run.pushDestination.admissionPaths
          : []),
      ]),
    ]
    const protection = protectAssistedCommitResources(
      run.repository.path,
      run.protectedPaths,
      run.originalResourceProtection
    )
    run.resourceProtection?.release()
    run.resourceProtection = protection
  }

  /** Reject competing Desktop mutations without delaying a later unrelated operation. */
  public assertAvailable(repository: Repository | CloningRepository): void {
    if (hasRepositoryGitOperationAccess(repository.path)) {
      return
    }
    const run = this.runs.get(repository.id)
    if (run !== undefined && run.repository.path === repository.path) {
      const state = this.cache.get(run.repository).changesState.assistedCommit
      if (
        !run.finished ||
        this.selectionReaders.has(repository.id) ||
        isAssistedCommitRepositoryLocked(state)
      ) {
        throw new ErrorWithMetadata(
          new AssistedCommitError(
            'busy',
            'Finish or cancel the assisted commit run before changing this repository'
          ),
          { repository }
        )
      }
    }
    if (this.selectionReaders.has(repository.id)) {
      throw new AssistedCommitError(
        'busy',
        'Assisted commit selections are still being verified'
      )
    }
    assertRepositoryGitAvailable(repository.path)
  }

  /** Preserve the existing overlapping-resource destruction admission policy. */
  public async withDestruction<T>(
    path: string,
    operation: () => Promise<T>
  ): Promise<T> {
    return withRepositoryGitDestruction(path, async () => {
      const removingPath = await canonicalMutationPath(path)
      for (const run of this.runs.values()) {
        const runState = this.cache.get(run.repository).changesState
          .assistedCommit
        if (
          run.finished &&
          !this.selectionReaders.has(run.repository.id) &&
          !isAssistedCommitRepositoryLocked(runState)
        ) {
          continue
        }
        const paths =
          run.protectedPaths ??
          (await getAssistedCommitProtectedPaths(run.repository.path))
        if (paths.some(path => repositoryPathsOverlap(path, removingPath))) {
          throw new AssistedCommitError(
            'busy',
            'An assisted commit run depends on files or Git metadata in this directory'
          )
        }
      }
      assertRepositoryGitDestructionAvailable(path)
      return operation()
    })
  }

  /** Cancel only the named live run, settling its own native dialogs and hook. */
  public cancel(repository: Repository, runId: string): void {
    const run = this.runs.get(repository.id)
    const state = this.cache.get(repository).changesState.assistedCommit
    if (
      run?.id !== runId ||
      run.finalized ||
      state.kind === 'idle' ||
      state.kind === 'error' ||
      state.kind === 'push-error' ||
      state.kind === 'pushing' ||
      state.kind === 'rolling-back' ||
      state.kind === 'refreshing' ||
      state.kind === 'closing' ||
      state.cancelRequested
    ) {
      return
    }
    this.cache.updateChangesState(run.repository, () => ({
      assistedCommit: { ...state, cancelRequested: true },
    }))
    try {
      run.controller.abort()
    } finally {
      try {
        run.consent?.resolve(false)
      } finally {
        try {
          run.hookFailure?.resolve('abort')
        } finally {
          const hook = this.cache.get(repository).hookProgress
          try {
            if (hook?.status === 'started') {
              hook.abort()
            }
          } finally {
            this.events.changed()
          }
        }
      }
    }
  }
  /** Preserve actual push errors without converting accepted history into rollback. */
  public failPush(run: IAssistedCommitRun, error: unknown): ErrorWithMetadata {
    const existing = this.cache.get(run.repository).changesState.assistedCommit
    const cause =
      existing.kind === 'push-error' &&
      !assistedCommitErrorCauses(error).includes(existing.error)
        ? new AggregateError([existing.error, error])
        : error
    const failure =
      cause === error && error instanceof Error
        ? error
        : new Error(error instanceof Error ? error.message : 'Push failed', {
            cause,
          })
    const metadata = new ErrorWithMetadata(failure, {
      repository: run.repository,
    })
    log.error('Assisted commit push failed; local commits were kept', metadata)
    this.cache.updateChangesState(run.repository, () => ({
      assistedCommit: {
        kind: 'push-error',
        runId: run.id,
        error: metadata,
        attempted: run.pushAttempted === true,
        settling: !run.finished,
      },
    }))
    this.events.changed()
    return metadata
  }
  /** Retire reversible capabilities synchronously at verified acceptance. */
  public accept(
    run: IAssistedCommitRun,
    assistedCommit: AssistedCommitRunState
  ): void {
    run.finalized = true
    run.recoveryCapability = undefined
    run.recovery = undefined
    run.cleanupPending = false
    run.cleanupToken = undefined
    this.cache.update(run.repository, state => ({
      ...state,
      allowEmptyCommit: false,
      changesState: {
        ...state.changesState,
        assistedCommit,
        fileListFilter: {
          ...state.changesState.fileListFilter,
          filterText: '',
        },
      },
    }))
  }
}
