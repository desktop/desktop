import {
  AssistedCommitPushError,
  prepareAssistedCommitPushOwner,
} from '../git/assisted-commit-push'
import {
  acquireAssistedCommitGitLease,
  withRepositoryGitSpawnFence,
} from '../git/repository-operation'
import {
  withAcceptedAliasFence,
  withAcceptedSpawnFence,
  verifyAcceptedOwner,
} from './push-ownership'
import type { AssistedCommitPush } from './push'
import { AssistedCommitRunOutcome } from '../../models/assisted-commit-run'
import { Repository } from '../../models/repository'
import {
  assistedCommitErrorCauses,
  getAssistedCommitCleanupToken,
  getAssistedCommitRecovery,
  isAssistedCommitCancellation,
} from '../assisted-commit-run'
import { ErrorWithMetadata } from '../error-with-metadata'
import {
  AssistedCommitError,
  disposeAssistedCommitSnapshot,
  retryAssistedCommitCleanup,
  rollbackAssistedCommitTransaction,
} from '../git/assisted-commit'
import {
  withoutRepositoryGitAccess,
  withRepositoryGitErrorPropagation,
  withRepositoryGitOperation,
} from '../git/repository-operation'
import { AssistedCommitContext } from './context'
import { recordAssistedCommitStats } from './execution'
import { AssistedCommitReaders } from './readers'
import { AssistedCommitSelection } from './selection'
import { AssistedCommitState } from './state'
import {
  createAssistedCommitSettlement,
  IAssistedCommitRepository,
  IAssistedCommitRun,
} from './types'

/** Compose recovery over existing owners; no second lifecycle or capability registry. */
export function createAssistedCommitRecovery(
  owner: AssistedCommitState,
  readers: AssistedCommitReaders,
  selections: AssistedCommitSelection,
  context: AssistedCommitContext,
  host: IAssistedCommitRepository,
  getPush: () => AssistedCommitPush
) {
  const recovery = {
    present,
    refresh,
    restore,
    retry,
    dismiss,
    handleFailure,
    finish,
  }
  return recovery

  /** Presentation failures cannot convert accepted commits into a failed transaction. */
  async function present(
    run: IAssistedCommitRun
  ): Promise<ErrorWithMetadata | undefined> {
    let historyDelivery = true
    let errorDelivered = false
    try {
      const historyError = await readers.resumeHistory(run.repository, run)
      historyDelivery = false
      if (historyError !== undefined) {
        errorDelivered = true
        throw historyError
      }
      owner.events.changed()
      return undefined
    } catch (error) {
      const state = owner.cache.get(run.repository).changesState.assistedCommit
      const ownedError =
        (state.kind === 'error' || state.kind === 'push-error') &&
        state.runId === run.id
      const failure = ownedError
        ? new AggregateError(
            [state.error, error],
            'Desktop could not present the settled assisted commit error'
          )
        : new Error(
            'Desktop could not present the settled assisted commit changes',
            { cause: error }
          )
      const metadata = new ErrorWithMetadata(failure, {
        repository: run.repository,
        gitContext: { kind: 'commit' },
      })
      log.error(failure.message, metadata)
      if (ownedError) {
        return owner.runs.get(run.repository.id) === run
          ? owner.fail(
              run,
              metadata,
              state.kind === 'error' ? state.retry : null,
              state.kind === 'error' ? state.selectionNeedsReview : false,
              false
            )
          : metadata
      }
      if (!historyDelivery && !errorDelivered) {
        try {
          owner.events.error(metadata)
        } catch (notificationError) {
          log.error(
            'Desktop could not deliver the settled assisted commit error',
            new AggregateError([metadata, notificationError])
          )
        }
      }
      return undefined
    }
  }

  /** Reconciliation propagates native failures rather than accepting stale UI state. */
  async function refresh(
    repository: Repository,
    clearPartialState: boolean
  ): Promise<void> {
    return withRepositoryGitErrorPropagation(() =>
      host.refresh(repository, clearPartialState)
    )
  }

  /** Refresh current repository state before restoring verified selection authority. */
  async function restore(
    run: IAssistedCommitRun,
    error: unknown
  ): Promise<boolean> {
    await recovery.refresh(run.repository, false)
    const rollbackComplete =
      run.recovery !== undefined &&
      run.recovery.history !== 'interfered' &&
      run.recovery.index !== 'interfered' &&
      run.recovery.errors.length === 0 &&
      run.recoveryCapability === undefined &&
      !run.cleanupPending
    return selections.restore(run, rollbackComplete ? 'current' : 'original')
  }

  /** Retry full recovery before cleanup-only capabilities, preserving original causes. */
  async function retry(repository: Repository, runId: string): Promise<void> {
    const run = owner.runs.get(repository.id)
    const state = owner.cache.get(repository).changesState.assistedCommit
    if (
      run?.id !== runId ||
      !run.finished ||
      (run.lease === undefined && owner.selectionReaders.has(repository.id)) ||
      state.kind !== 'error' ||
      state.retry === null ||
      (state.retry === 'recovery' && run.lease === undefined)
    ) {
      return
    }
    run.finished = false
    run.selectionReadersClosed = false
    run.settlement = createAssistedCommitSettlement()
    run.reconciling = true
    run.selectionReadError = undefined
    try {
      owner.set(run, {
        kind: state.retry === 'recovery' ? 'rolling-back' : 'refreshing',
        runId,
      })
      if (
        run.finalized &&
        run.pushPublicationPending &&
        run.lease === undefined
      ) {
        if (run.protectedPaths === undefined) {
          throw new Error(
            'Accepted publication has no retained Git resource admission'
          )
        }
        if (run.pushDestination?.kind !== 'configured') {
          throw new Error(
            'Accepted publication has no frozen repository admission'
          )
        }
        owner.protect(run, run.protectedPaths)
        run.lease = await acquireAssistedCommitGitLease(
          run.pushDestination.path,
          run.protectedPaths,
          () => verifyAcceptedOwner(run)
        )
      }
      const capability = run.recoveryCapability
      let verifyRecoveryAlias: (() => void) | undefined
      const recover = async () => {
        if (state.retry === 'recovery') {
          if (capability !== undefined) {
            run.recovery = await rollbackAssistedCommitTransaction(capability)
            run.recoveryCapability = undefined
          }
          if (run.cleanupPending) {
            if (run.cleanupToken !== undefined) {
              await retryAssistedCommitCleanup(run.cleanupToken)
            } else if (run.snapshot !== undefined) {
              await disposeAssistedCommitSnapshot(run.snapshot)
            } else {
              throw new Error(
                'The retained assisted cleanup capability is unavailable'
              )
            }
            run.cleanupPending = false
            run.cleanupToken = undefined
          }
        }
        if (run.recovery === undefined && run.result === undefined) {
          // No transaction changed history. Reconcile current content, not a stale cleanup fence.
          run.selectionFence = undefined
          selections.clearRestored(repository)
        }
        return withRepositoryGitErrorPropagation(async () => {
          if (run.finalized) {
            await getPush().completePublication(run)
            if (run.pushDestination?.kind === 'configured') {
              verifyRecoveryAlias = await prepareAssistedCommitPushOwner(
                repository,
                run.pushDestination
              )
            }
          }
          const restore = async () => {
            if (run.finalized) {
              await recovery.refresh(run.repository, true)
              return false
            }
            return recovery.restore(run, state.error)
          }
          const restoreAndRefresh = async () => {
            const needsReview = await restore()
            const deferredRepository = readers.takeRefresh(repository)
            if (deferredRepository !== undefined) {
              await withAcceptedAliasFence(
                run,
                [deferredRepository ?? repository],
                () =>
                  host.refreshAll(
                    run.finalized
                      ? run.repository
                      : deferredRepository ?? repository
                  )
              )
            }
            if (!run.finalized) {
              await selections.verifyFence(run)
            }
            return needsReview
          }
          return verifyRecoveryAlias === undefined
            ? restoreAndRefresh()
            : withRepositoryGitSpawnFence(
                verifyRecoveryAlias,
                restoreAndRefresh
              )
        })
      }
      const needsReview =
        run.lease === undefined
          ? await withRepositoryGitOperation(
              run.finalized
                ? run.pushDestination?.kind === 'configured'
                  ? run.pushDestination.path
                  : run.repository.path
                : repository.path,
              'read',
              () => withAcceptedSpawnFence(run, recover),
              false,
              () => verifyAcceptedOwner(run)
            )
          : await run.lease.run(recover, true)
      run.lease?.release()
      run.lease = undefined
      await readers.finish(run)
      if (run.selectionReadError !== undefined) {
        throw run.selectionReadError
      }
      verifyRecoveryAlias?.()
      run.finished = true
      owner.cache.update(repository, () => ({
        isCommitting: false,
      }))
      run.resourceProtection?.release()
      run.resourceProtection = undefined
      run.settlement.complete()
      if (needsReview) {
        owner.fail(run, state.error, null, true, false)
      } else {
        if (owner.runs.get(repository.id) === run) {
          owner.runs.delete(repository.id)
        }
        owner.cache.updateChangesState(repository, () => ({
          assistedCommit: { kind: 'idle' },
        }))
      }
    } catch (error) {
      retainCleanup(run, error)
      run.recovery = getAssistedCommitRecovery(error) ?? run.recovery
      const capability = run.recoveryCapability
      if (
        run.recovery !== undefined &&
        capability !== undefined &&
        'snapshotId' in capability
      ) {
        run.recovery = Object.freeze({
          ...run.recovery,
          retryToken: capability,
        })
      }
      owner.fail(
        run,
        new AggregateError(
          [state.error, error],
          'Assisted commit recovery still needs attention'
        ),
        run.recoveryCapability !== undefined || run.cleanupPending
          ? 'recovery'
          : assistedCommitErrorCauses(error).some(
              cause =>
                cause instanceof AssistedCommitPushError &&
                cause.publicationStale
            )
          ? null
          : 'refresh',
        state.selectionNeedsReview,
        false
      )
      if (run.recoveryCapability === undefined && !run.cleanupPending) {
        run.lease?.release()
        run.lease = undefined
        owner.cache.update(repository, () => ({
          isCommitting: false,
        }))
      }
    } finally {
      run.finished = true
      run.settlement.complete()
      owner.updateErrorSettlement(repository)
      owner.releaseResources(run)
    }
    await recovery.present(run)
  }

  /** Capture cleanup obligations even when snapshot initialization never completed. */
  function retainCleanup(run: IAssistedCommitRun, error: unknown): void {
    run.cleanupToken = getAssistedCommitCleanupToken(error) ?? run.cleanupToken
    run.cleanupPending =
      run.cleanupPending === true ||
      run.cleanupToken !== undefined ||
      (run.snapshot !== undefined &&
        assistedCommitErrorCauses(error).some(
          cause =>
            cause instanceof AssistedCommitError &&
            cause.code === 'cleanup-failed'
        ))
  }

  /** Dismiss only settled errors without native or reader recovery obligations. */
  function dismiss(repository: Repository, runId: string): void {
    const state = owner.cache.get(repository).changesState.assistedCommit
    const run = owner.runs.get(repository.id)
    if (
      (state.kind !== 'error' && state.kind !== 'push-error') ||
      state.runId !== runId ||
      run?.finished === false ||
      owner.selectionReaders.has(repository.id) ||
      (state.kind === 'error' && state.retry !== null)
    ) {
      return
    }
    if (run !== undefined) {
      run.resourceProtection?.release()
      run.resourceProtection = undefined
      if (owner.runs.get(repository.id) === run) {
        owner.runs.delete(repository.id)
      }
      owner.cache.updateChangesState(repository, () => ({
        assistedCommit: { kind: 'idle' },
      }))
      owner.events.changed()
    } else {
      owner.cache.updateChangesState(repository, () => ({
        assistedCommit: { kind: 'idle' },
      }))
      owner.events.changed()
    }
  }

  /** Recover all-and-only run commits, preserving current files and original causes. */
  async function handleFailure(
    run: IAssistedCommitRun,
    originalError: unknown
  ): Promise<{
    readonly outcome: AssistedCommitRunOutcome
    readonly verifiedCancellation: boolean
  }> {
    let outcome: AssistedCommitRunOutcome
    let verifiedCancellation = false

    if (run.finalized && run.result !== undefined) {
      if (run.pushAfterAssistedCommit && !run.pushSucceeded) {
        const error = owner.failPush(run, originalError)
        outcome = {
          kind: 'push-error',
          result: run.result,
          error,
          attempted: run.pushAttempted === true,
        }
      } else {
        const error = owner.fail(
          run,
          new Error(
            run.pushSucceeded
              ? 'Commits were pushed, but Desktop presentation failed'
              : 'Commits were accepted locally, but Desktop presentation failed',
            { cause: originalError }
          ),
          assistedCommitErrorCauses(originalError).some(
            error =>
              error instanceof AssistedCommitPushError && error.publicationStale
          )
            ? null
            : 'refresh',
          false,
          false
        )
        outcome = run.pushSucceeded
          ? { kind: 'pushed', result: run.result, refreshError: error }
          : { kind: 'local-ready', result: run.result }
      }
    } else {
      run.reconciling = true
      let error = originalError
      let uncapturedSelectionFailed = false
      if (run.snapshotAuthorized !== true && run.inputVersions !== undefined) {
        try {
          if (run.lease !== undefined) {
            await run.lease.run(() => selections.certifyUncaptured(run), true)
          } else {
            await selections.certifyUncaptured(run)
          }
        } catch (selectionError) {
          error = new AggregateError(
            [originalError, selectionError],
            'Selected files changed before the assisted run could start'
          )
          uncapturedSelectionFailed = true
        }
      }
      run.recovery = getAssistedCommitRecovery(error)
      const completed = run.result
      if (
        completed !== undefined &&
        !run.finalized &&
        run.lease !== undefined
      ) {
        try {
          run.recovery = await run.lease.run(() =>
            rollbackAssistedCommitTransaction(completed, {
              onProgress: progress =>
                withoutRepositoryGitAccess(() =>
                  context.progress(run, progress)
                ),
            })
          )
          run.recoveryCapability = undefined
        } catch (recoveryError) {
          run.recovery = getAssistedCommitRecovery(recoveryError)
          error = new AggregateError(
            [originalError, recoveryError],
            'Assisted commit failed and recovery needs attention'
          )
        }
      } else {
        run.recoveryCapability = run.recovery?.retryToken
      }
      retainCleanup(run, error)
      const retryRecovery =
        run.recoveryCapability !== undefined || run.cleanupPending === true
      let selectionNeedsReview = false
      let reconciliationFailed = uncapturedSelectionFailed
      if (
        run.snapshotAuthorized !== true &&
        assistedCommitErrorCauses(error).some(
          cause =>
            cause instanceof AssistedCommitError &&
            (cause.code === 'selection-changed' ||
              cause.code === 'repository-changed')
        )
      ) {
        reconciliationFailed = true
        selectionNeedsReview = true
      }
      if (
        !retryRecovery &&
        run.lease !== undefined &&
        run.snapshot !== undefined
      ) {
        try {
          selectionNeedsReview = await run.lease.run(
            () => recovery.restore(run, error),
            true
          )
        } catch (refreshError) {
          reconciliationFailed = true
          error = new AggregateError(
            [error, refreshError],
            'Assisted commit stopped, but Desktop could not refresh the changes'
          )
        }
      }
      if (
        !retryRecovery &&
        !reconciliationFailed &&
        run.authorizationError === undefined &&
        isAssistedCommitCancellation(error) &&
        !selectionNeedsReview
      ) {
        verifiedCancellation = true
        outcome = { kind: run.declined ? 'declined' : 'cancelled' }
      } else {
        const failure =
          run.authorizationError === undefined
            ? error
            : new Error(run.authorizationError.message, { cause: error })
        const metadata = owner.fail(
          run,
          failure,
          retryRecovery ? 'recovery' : reconciliationFailed ? 'refresh' : null,
          selectionNeedsReview,
          false
        )
        outcome = { kind: 'error', error: metadata }
      }
    }

    return { outcome, verifiedCancellation }
  }

  /** Drain readers and retained capabilities before publishing reusable readiness. */
  async function finish(
    run: IAssistedCommitRun,
    outcome: AssistedCommitRunOutcome | undefined,
    verifiedCancellation: boolean
  ): Promise<AssistedCommitRunOutcome | undefined> {
    const repository = run.repository

    run.reconciling = true
    try {
      owner.cache.update(repository, () => ({
        isPushPullFetchInProgress: false,
        pushPullFetchProgress: null,
      }))
      run.consent?.resolve(false)
      run.hookFailure?.resolve('abort')
      const state = owner.cache.get(repository).changesState.assistedCommit
      const retainsOwnership =
        state.kind === 'error' && state.retry === 'recovery'
      if (!retainsOwnership) {
        const deferredRepository = readers.takeRefresh(repository)
        if (deferredRepository !== undefined) {
          try {
            const refresh = () =>
              withAcceptedAliasFence(
                run,
                [deferredRepository ?? repository],
                () =>
                  withRepositoryGitErrorPropagation(async () => {
                    await host.refreshAll(
                      run.finalized
                        ? run.repository
                        : deferredRepository ?? repository
                    )
                    await selections.verifyFence(run)
                  })
              )
            if (run.lease !== undefined) {
              await run.lease.run(refresh, true)
            } else {
              await withRepositoryGitOperation(
                run.finalized && run.pushDestination?.kind === 'configured'
                  ? run.pushDestination.path
                  : repository.path,
                'read',
                refresh,
                false,
                () => verifyAcceptedOwner(run)
              )
            }
          } catch (error) {
            const metadata = owner.fail(
              run,
              run.finalized
                ? new Error(
                    'Commits were accepted locally, but Desktop could not refresh them',
                    { cause: error }
                  )
                : error,
              'refresh',
              true,
              false
            )
            if (run.pushSucceeded && run.result !== undefined) {
              outcome = {
                kind: 'pushed',
                result: run.result,
                refreshError: metadata,
              }
            } else if (!run.finalized) {
              outcome = { kind: 'error', error: metadata }
            }
          }
        }
        run.lease?.release()
        run.lease = undefined
        await readers.finish(run)
        if (
          run.selectionReadError !== undefined &&
          (!run.finalized || run.pushSucceeded)
        ) {
          const metadata = owner.fail(
            run,
            run.selectionReadError,
            'refresh',
            true,
            false
          )
          outcome =
            run.pushSucceeded && run.result !== undefined
              ? {
                  kind: 'pushed',
                  result: run.result,
                  refreshError: metadata,
                }
              : { kind: 'error', error: metadata }
        }
        owner.cache.update(repository, () => ({
          isCommitting: false,
          hookProgress: null,
          subscribeToCommitOutput: null,
        }))
        if (
          verifiedCancellation &&
          owner.cache.get(repository).changesState.assistedCommit.kind !==
            'error'
        ) {
          owner.cache.updateChangesState(repository, () => ({
            assistedCommit: { kind: 'idle' },
          }))
        }
        if (
          owner.cache.get(repository).changesState.assistedCommit.kind ===
            'idle' &&
          owner.runs.get(repository.id) === run
        ) {
          owner.runs.delete(repository.id)
        }
      } else {
        owner.cache.update(repository, () => ({
          hookProgress: null,
          subscribeToCommitOutput: null,
        }))
      }
    } finally {
      try {
        const current = owner.cache.get(repository).changesState.assistedCommit
        if (current.kind !== 'error' || current.retry !== 'recovery') {
          run.lease?.release()
          run.lease = undefined
          if (!run.selectionReadersClosed) {
            await readers.finish(run)
          }
          owner.cache.update(repository, () => ({
            isCommitting: false,
            hookProgress: null,
            subscribeToCommitOutput: null,
          }))
        }
      } finally {
        run.finished = true
        run.settlement.complete()
        owner.updateErrorSettlement(repository)
        owner.releaseResources(run)
      }
    }
    if (run.finalized) {
      try {
        await recordAssistedCommitStats(run, host)
      } catch (error) {
        const failure = new Error(
          'Commits were created locally, but their usage statistics could not be recorded',
          { cause: error }
        )
        log.error(failure.message, failure)
        if (!owner.runs.has(repository.id)) {
          owner.runs.set(repository.id, run)
        }
        if (owner.runs.get(repository.id) === run) {
          owner.fail(run, failure, null, false, false)
        }
      }
      try {
        const historyError = await readers.resumeHistory(repository, run)
        if (
          historyError !== undefined &&
          run.pushSucceeded &&
          run.result !== undefined
        ) {
          outcome = {
            kind: 'pushed',
            result: run.result,
            refreshError: historyError,
          }
        }
        owner.events.changed()
      } catch (error) {
        log.error('Accepted assisted commits could not be presented', error)
        if (!owner.runs.has(repository.id)) {
          owner.runs.set(repository.id, run)
        }
        if (owner.runs.get(repository.id) === run) {
          owner.fail(
            run,
            new Error(
              'Commits were accepted locally, but Desktop notification failed',
              { cause: error }
            ),
            null,
            false,
            false
          )
        }
      }
    } else {
      const presentationError = await recovery.present(run)
      if (presentationError !== undefined) {
        outcome = { kind: 'error', error: presentationError }
      }
    }

    return outcome
  }
}

/** Recovery commands share the exact run, readers and selection owners. */
export type AssistedCommitRecovery = ReturnType<
  typeof createAssistedCommitRecovery
>
