import { Repository } from '../../models/repository'
import { Branch, BranchType } from '../../models/branch'
import { TipState } from '../../models/tip'
import { AssistedCommitRunOutcome } from '../../models/assisted-commit-run'
import { IRepositoryState } from '../app-state'
import { assistedCommitErrorCauses } from '../assisted-commit-run'
import {
  AssistedCommitError,
  IAssistedCommitResult,
  acceptVerifiedAssistedCommitTransaction,
  prepareAssistedCommitTransactionForPush,
} from '../git/assisted-commit'
import {
  AssistedCommitPushDestination,
  AssistedCommitPushError,
  completeAssistedCommitPushPublication,
  prepareAssistedCommitPushDestination,
  prepareAssistedCommitPushOwner,
  readAssistedCommitPushDestination,
  verifyAssistedCommitPushOwner,
} from '../git/assisted-commit-push'
import {
  acquireAssistedCommitGitLease,
  getAssistedCommitProtectedPaths,
  isRepositoryAffectedByAssistedCommit,
  isRepositoryGitMutationInProgress,
  protectAssistedCommitResources,
  withoutRepositoryGitAccess,
  withRepositoryGitErrorPropagation,
  withRepositoryGitOperation,
  withRepositoryGitSpawnFence,
} from '../git/repository-operation'
import { AssistedCommitContext } from './context'
import { AssistedCommitDialogs } from './dialogs'
import { AssistedCommitReaders } from './readers'
import { AssistedCommitRecovery } from './recovery'
import { AssistedCommitState } from './state'
import {
  createAssistedCommitSettlement,
  IAssistedCommitRun,
  IAssistedCommitRepository,
  AssistedCommitPushOutcome,
} from './types'
import { withAcceptedAliasFence } from './push-ownership'

/** Frozen-destination push, publication and push-only retry for accepted local commits. */
export class AssistedCommitPush {
  public constructor(
    private readonly state: AssistedCommitState,
    private readonly context: AssistedCommitContext,
    private readonly dialogs: AssistedCommitDialogs,
    private readonly readers: AssistedCommitReaders,
    private readonly recovery: AssistedCommitRecovery,
    private readonly repository: IAssistedCommitRepository,
    private readonly acceptLocal: (
      run: IAssistedCommitRun,
      result: IAssistedCommitResult
    ) => void
  ) {}

  /** Capture the original branch and native push configuration before confirmation. */
  public readDestination(
    repository: Repository,
    state: IRepositoryState
  ): Promise<AssistedCommitPushDestination> {
    const tip = state.branchesState.tip
    const ref =
      tip.kind === TipState.Valid
        ? tip.branch.ref
        : tip.kind === TipState.Unborn
        ? tip.ref.startsWith('refs/heads/')
          ? tip.ref
          : `refs/heads/${tip.ref}`
        : null
    return readAssistedCommitPushDestination(repository, ref)
  }

  /** Continue verified local execution without accepting it before native push entry. */
  public async execute(
    run: IAssistedCommitRun,
    result: IAssistedCommitResult,
    requestedRepository: Repository = run.repository
  ): Promise<AssistedCommitRunOutcome> {
    const lease = run.lease
    if (lease === undefined) {
      throw new AssistedCommitError(
        'disposed',
        'Assisted push has no Git owner'
      )
    }
    this.state.set(run, {
      kind: 'preparing-push',
      runId: run.id,
      cancelRequested: false,
      canCancel: !run.finalized,
    })
    if (!run.finalized) {
      this.context.check(run)
    }
    let outcome: AssistedCommitPushOutcome
    try {
      const destination = run.pushDestination
      if (destination === undefined) {
        throw new AssistedCommitPushError(
          'The original push destination is unavailable'
        )
      }
      if (destination.kind === 'unavailable') {
        throw destination.error
      }
      const expectedTip = result.head.sha
      if (expectedTip === null || result.head.ref !== destination.branchRef) {
        throw new AssistedCommitPushError(
          'The completed run has no pushable original branch'
        )
      }
      const branch = new Branch(
        destination.branchRef.slice('refs/heads/'.length),
        destination.publishBranch
          ? null
          : `${destination.remote.name}/${destination.remoteRef.slice(
              'refs/heads/'.length
            )}`,
        { sha: expectedTip },
        BranchType.Local,
        destination.branchRef
      )
      outcome = await lease.run(() =>
        withRepositoryGitErrorPropagation(async () => {
          if (this.state.cache.get(run.repository).isPushPullFetchInProgress) {
            throw new AssistedCommitPushError(
              'Finish the current network operation before retrying push'
            )
          }
          this.state.cache.update(run.repository, () => ({
            isPushPullFetchInProgress: true,
          }))
          return this.repository.push(
            run.repository,
            branch,
            destination.remote,
            {
              assistedCommit: {
                expectedTip,
                remoteRef: destination.remoteRef,
                pushURL: destination.pushURL,
                rawPushURL: destination.rawPushURL,
                pushURLSource: destination.pushURLSource,
                prepareForSpawn: async () => {
                  const verifyDestination = async () => {
                    const requested =
                      requestedRepository.path === run.repository.path
                        ? undefined
                        : await prepareAssistedCommitPushOwner(
                            requestedRepository,
                            destination
                          )
                    const execution =
                      await prepareAssistedCommitPushDestination(
                        run.repository,
                        destination,
                        result.head
                      )
                    return () => {
                      requested?.()
                      execution()
                    }
                  }
                  const enter = run.finalized
                    ? await verifyDestination()
                    : await prepareAssistedCommitTransactionForPush(
                        result,
                        verifyDestination,
                        { signal: run.controller.signal }
                      )
                  return () => {
                    if (this.state.runs.get(run.repository.id) !== run) {
                      throw new AssistedCommitPushError(
                        'Push retry belongs to an expired run'
                      )
                    }
                    if (!run.finalized) {
                      this.context.check(run)
                    }
                    enter()
                    if (!run.finalized) {
                      this.state.accept(run, {
                        kind: 'pushing',
                        runId: run.id,
                        phase: 'push',
                        progress: null,
                      })
                    } else {
                      this.state.cache.updateChangesState(
                        run.repository,
                        () => ({
                          assistedCommit: {
                            kind: 'pushing',
                            runId: run.id,
                            phase: 'push',
                            progress: null,
                          },
                        })
                      )
                    }
                    run.pushAttempted = true
                  }
                },
              },
              onHookProgress: this.dialogs.hookProgress(run.repository),
              onHookFailure: (name, output) =>
                withoutRepositoryGitAccess(() =>
                  this.dialogs.requestHookFailure(run, name, output)
                ),
              onTerminalOutputAvailable: subscribeToCommitOutput => {
                this.state.cache.update(run.repository, () => ({
                  subscribeToCommitOutput,
                }))
                this.state.events.changed()
              },
            },
            {
              onProgress: progress => {
                const state = this.state.cache.get(run.repository).changesState
                  .assistedCommit
                if (state.kind === 'pushing' && state.runId === run.id) {
                  this.state.set(run, {
                    ...state,
                    progress,
                  })
                }
              },
              onPushed: () => {
                run.pushSucceeded = true
                run.pushPublicationPending = destination.publishBranch
                this.state.set(run, {
                  kind: 'pushing',
                  runId: run.id,
                  phase: 'refresh',
                  progress: null,
                })
              },
              completePublication: () =>
                this.completePublication(run, run.repository),
              verifyFollowUpOwner: () =>
                verifyAssistedCommitPushOwner(destination),
            }
          )
        })
      )
    } catch (error) {
      outcome = { kind: 'error', error }
    }
    if (outcome.kind !== 'pushed') {
      if (!run.finalized) {
        const unsafe = assistedCommitErrorCauses(outcome.error).some(
          error => error instanceof AssistedCommitError && error.code !== 'busy'
        )
        if (
          unsafe ||
          run.authorizationError !== undefined ||
          run.controller.signal.aborted
        ) {
          throw outcome.error
        }
        await lease.run(
          () =>
            acceptVerifiedAssistedCommitTransaction(
              result,
              () => {
                this.context.check(run)
                this.state.set(run, {
                  kind: 'closing',
                  runId: run.id,
                })
              },
              { signal: run.controller.signal }
            ),
          true
        )
        this.acceptLocal(run, result)
      }
      const error = this.state.failPush(run, outcome.error)
      return {
        kind: 'push-error',
        result,
        error,
        attempted: run.pushAttempted === true,
      }
    }
    let refreshError = outcome.refreshError
    try {
      this.repository.recordPush(run.repository)
    } catch (error) {
      refreshError =
        refreshError === undefined
          ? error
          : new AggregateError(
              [refreshError, error],
              'Pushed commits need refresh or statistics attention'
            )
    }
    if (refreshError !== undefined) {
      const error = this.state.fail(
        run,
        new Error(
          'Commits were pushed, but Desktop could not finish refreshing them',
          { cause: refreshError }
        ),
        assistedCommitErrorCauses(refreshError).some(
          error =>
            error instanceof AssistedCommitPushError && error.publicationStale
        )
          ? null
          : 'refresh',
        false,
        false
      )
      return { kind: 'pushed', result, refreshError: error }
    }
    this.state.set(run, { kind: 'idle' })
    return { kind: 'pushed', result }
  }

  /** Coalesce push-only retries for the exact accepted run. */
  public retry(
    repository: Repository,
    runId: string
  ): Promise<AssistedCommitRunOutcome | undefined> {
    const run = this.state.runs.get(repository.id)
    if (run?.id === runId && run.pushRetry !== undefined) {
      return run.pushRetry
    }
    const state = this.state.cache.get(repository).changesState.assistedCommit
    if (
      run?.id !== runId ||
      !run.finished ||
      !run.finalized ||
      run.result === undefined ||
      state.kind !== 'push-error' ||
      state.runId !== runId ||
      state.settling
    ) {
      return Promise.resolve(undefined)
    }
    const result = run.result
    const retry = Promise.resolve()
      .then(() => this.retryRun(run, result, repository))
      .finally(() => {
        if (run.pushRetry === retry) {
          run.pushRetry = undefined
        }
      })
    run.pushRetry = retry
    return retry
  }

  /** Reacquire original ownership without planning, capturing or creating commits. */
  public async retryRun(
    run: IAssistedCommitRun,
    result: IAssistedCommitResult,
    requestedRepository: Repository
  ): Promise<AssistedCommitRunOutcome> {
    const repository = run.repository
    if (this.state.runs.get(repository.id) !== run) {
      return { kind: 'busy' }
    }
    const destination = run.pushDestination
    if (destination?.kind !== 'configured') {
      const error = this.state.failPush(
        run,
        destination?.error ??
          new AssistedCommitPushError(
            'The original push destination is unavailable'
          )
      )
      return {
        kind: 'push-error',
        result,
        error,
        attempted: run.pushAttempted === true,
      }
    }
    let verifyAliases: ReadonlyArray<() => void>
    try {
      verifyAliases = await Promise.all(
        [
          repository,
          ...(requestedRepository.path === repository.path
            ? []
            : [requestedRepository]),
        ].map(alias => prepareAssistedCommitPushOwner(alias, destination))
      )
      for (const verify of verifyAliases) {
        verify()
      }
    } catch (error) {
      if (this.state.runs.get(repository.id) !== run) {
        return { kind: 'busy' }
      }
      return {
        kind: 'push-error',
        result,
        error: this.state.failPush(run, error),
        attempted: run.pushAttempted === true,
      }
    }
    if (this.state.runs.get(repository.id) !== run) {
      return { kind: 'busy' }
    }
    const verifyOwner = () => {
      for (const verify of verifyAliases) {
        verify()
      }
    }
    const state = this.state.cache.get(repository)
    if (
      state.isCommitting ||
      state.isPushPullFetchInProgress ||
      state.checkoutProgress !== null ||
      isRepositoryGitMutationInProgress(repository.path) ||
      isRepositoryAffectedByAssistedCommit(repository.path) ||
      this.state.selectionReaders.has(repository.id)
    ) {
      const error = this.state.failPush(
        run,
        new AssistedCommitPushError(
          'Finish the current Git operation before retrying push'
        )
      )
      return {
        kind: 'push-error',
        result,
        error,
        attempted: run.pushAttempted === true,
      }
    }
    run.finished = false
    run.reconciling = false
    run.selectionReadError = undefined
    run.selectionReadersClosed = false
    run.settlement = createAssistedCommitSettlement()
    let outcome: AssistedCommitRunOutcome
    try {
      run.resourceProtection = protectAssistedCommitResources(
        repository.path,
        undefined,
        run.originalResourceProtection
      )
      this.state.cache.update(repository, () => ({
        isCommitting: true,
      }))
      this.state.set(run, {
        kind: 'preparing-push',
        runId: run.id,
        cancelRequested: false,
        canCancel: false,
      })
      this.state.protect(
        run,
        await withRepositoryGitOperation(
          destination.path,
          'read',
          () =>
            withRepositoryGitSpawnFence(verifyOwner, () =>
              getAssistedCommitProtectedPaths(destination.path)
            ),
          false,
          verifyOwner
        )
      )
      verifyOwner()
      run.lease = await acquireAssistedCommitGitLease(
        destination.path,
        run.protectedPaths,
        verifyOwner
      )
      outcome = await this.execute(run, result, requestedRepository)
    } catch (error) {
      const metadata = this.state.failPush(run, error)
      outcome = {
        kind: 'push-error',
        result,
        error: metadata,
        attempted: run.pushAttempted === true,
      }
    } finally {
      run.reconciling = true
      try {
        verifyOwner()
        run.hookFailure?.resolve('abort')
        const deferredRepository = this.readers.takeRefresh(repository)
        if (deferredRepository !== undefined) {
          const refresh = () =>
            withAcceptedAliasFence(
              run,
              [requestedRepository, deferredRepository ?? repository],
              () =>
                withRepositoryGitErrorPropagation(() =>
                  this.repository.refreshAll(run.repository)
                )
            )
          if (run.lease === undefined) {
            await withRepositoryGitOperation(
              destination.path,
              'read',
              refresh,
              false,
              verifyOwner
            )
          } else {
            await run.lease.run(refresh, true)
          }
        }
        run.lease?.release()
        run.lease = undefined
        await this.readers.finish(run)
        if (run.selectionReadError !== undefined) {
          throw run.selectionReadError
        }
      } catch (error) {
        if (run.pushSucceeded) {
          const metadata = this.state.fail(
            run,
            new Error(
              'Commits were pushed, but Desktop could not refresh them',
              { cause: error }
            ),
            'refresh',
            false,
            false
          )
          outcome = { kind: 'pushed', result, refreshError: metadata }
        } else {
          const metadata = this.state.failPush(run, error)
          outcome = {
            kind: 'push-error',
            result,
            error: metadata,
            attempted: run.pushAttempted === true,
          }
        }
      } finally {
        run.lease?.release()
        run.lease = undefined
        run.finished = true
        run.settlement.complete()
        this.state.cache.update(repository, () => ({
          isCommitting: false,
          isPushPullFetchInProgress: false,
          pushPullFetchProgress: null,
          hookProgress: null,
          subscribeToCommitOutput: null,
        }))
        this.state.updateErrorSettlement(repository)
        this.state.releaseResources(run)
        if (
          this.state.cache.get(repository).changesState.assistedCommit.kind ===
            'idle' &&
          this.state.runs.get(repository.id) === run
        ) {
          this.state.runs.delete(repository.id)
        }
      }
    }
    const presentationError = await this.recovery.present(run)
    if (presentationError !== undefined && run.pushSucceeded) {
      outcome = { kind: 'pushed', result, refreshError: presentationError }
    }
    return outcome
  }

  /** Finish retained post-ACK publication under the original resource admission. */
  public async completePublication(
    run: IAssistedCommitRun,
    repository: Repository = run.repository
  ): Promise<void> {
    if (!run.pushPublicationPending) {
      return
    }
    if (run.pushDestination === undefined || run.result === undefined) {
      throw new Error('Accepted push has no retained publication intent')
    }
    try {
      await completeAssistedCommitPushPublication(
        repository,
        run.pushDestination,
        run.result.head,
        run.publicationResources
      )
    } catch (error) {
      if (
        error instanceof AssistedCommitPushError &&
        error.publicationStale &&
        run.publicationResources.locks.every(
          lock => lock.closed && lock.consumed
        )
      ) {
        run.pushPublicationPending = false
      }
      throw error
    }
    run.pushPublicationPending = false
  }
}
