import { readFile } from 'fs/promises'
import { join } from 'path'
import {
  IAssistedCommitHead,
  IAssistedCommitSnapshot,
  IValidatedAssistedCommitPlan,
} from '../../../models/assisted-commit'
import { formatCommitMessage } from '../../format-commit-message'
import { HookCallbackOptions } from '../core'
import { updateRefWithVerification, withRefLock } from '../update-ref'
import { IOwnedFileLease, releaseOwnedFileLock } from '../owned-file-lock'
import {
  AssistedCommitError,
  checkAssistedCommitCancellation,
  IAssistedCommitRecovery,
  IAssistedCommitRecoveryToken,
} from './error'
import {
  ensureNoRepositoryOperation,
  indexStatesEqual,
  installIndex,
  IOwnedIndexLock,
  lockIndex,
  privateGit,
  readHead,
  readIndexState,
  readOptionalFile,
  releaseIndexLock,
  removeGitLineEnding,
  verifyHead,
  verifyIndex,
  verifySelectedFiles,
} from './git'
import { IAssistedCommitOperationOptions } from './progress'
import { disposeAssistedCommitSnapshot } from './snapshot'
import {
  disposedSnapshots,
  getSnapshotData,
  IAssistedCommitData,
  IIndexState,
  validatedPlans,
} from './state'

/** Hook interception and transaction controls, with no per-commit option overrides. */
export interface IAssistedCommitExecutionOptions
  extends IAssistedCommitOperationOptions,
    HookCallbackOptions {}

/** Completed local commits. Pushing is deliberately outside this engine. */
export interface IAssistedCommitResult {
  /** The disposed snapshot, retaining caller-owned selection/recovery information. */
  readonly snapshot: IAssistedCommitSnapshot
  /** Full commit object IDs in creation order. */
  readonly commits: ReadonlyArray<string>
  /** The final complete HEAD identity. */
  readonly head: IAssistedCommitHead
  /** The final tree, equal to the frozen selected tree. */
  readonly tree: string
}

interface ICompletedTransaction {
  readonly data: IAssistedCommitData
  readonly created: ReadonlyArray<string>
  readonly installedIndex: IIndexState | undefined
  readonly ownedLocks: IOwnedFileLease[]
  expectedTip: string | null
  recovering: boolean
}

type AssistedCommitRecoveryCapability =
  | IAssistedCommitResult
  | IAssistedCommitRecoveryToken

const completedTransactions = new WeakMap<
  AssistedCommitRecoveryCapability,
  ICompletedTransaction
>()
const finalizedTransactions = new WeakSet<AssistedCommitRecoveryCapability>()

async function cleanupOwnedLocks(
  locks: ReadonlyArray<IOwnedFileLease>
): Promise<ReadonlyArray<unknown>> {
  const errors: unknown[] = []
  for (const lock of locks) {
    try {
      await releaseOwnedFileLock(lock)
    } catch (error) {
      errors.push(error)
    }
  }
  return errors
}

async function privateTip(data: IAssistedCommitData): Promise<string | null> {
  const result = await privateGit(
    data,
    ['rev-parse', '--verify', '--quiet', '--end-of-options', 'HEAD^{commit}'],
    'assistedCommitPrivateTip',
    { successExitCodes: new Set([0, 1]) }
  )
  return result.exitCode === 0 ? removeGitLineEnding(result.stdout) : null
}

async function verifyCreatedCommit(
  data: IAssistedCommitData,
  sha: string,
  parent: string | null,
  tree: string
): Promise<void> {
  const replacements = await privateGit(
    data,
    ['replace', '--list'],
    'assistedCommitVerifyPrivateHistory'
  )
  if (
    replacements.stdout.length > 0 ||
    (await readOptionalFile(
      join(data.temporaryDirectory, 'info', 'grafts')
    )) !== null
  ) {
    throw new AssistedCommitError(
      'commit-failed',
      'A hook introduced private replacement or grafted history'
    )
  }
  const object = await privateGit(
    data,
    ['--no-replace-objects', 'cat-file', 'commit', sha],
    'assistedCommitVerifyCommit'
  )
  const separator = object.stdout.indexOf('\n\n')
  const header = object.stdout.slice(0, separator).split('\n')
  const parents: string[] = []
  let parentEnd = 1
  while (header[parentEnd]?.startsWith('parent ')) {
    parents.push(header[parentEnd].slice(7))
    parentEnd++
  }
  const message = object.stdout.slice(separator + 2)
  if (
    !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(sha) ||
    separator === -1 ||
    header[0] !== `tree ${tree}` ||
    parents.length !== (parent === null ? 0 : 1) ||
    (parent !== null && parents[0] !== parent) ||
    header.slice(parentEnd).some(line => line.startsWith('parent ')) ||
    message.split('\n')[0].trim().length === 0
  ) {
    throw new AssistedCommitError(
      'commit-failed',
      `Git or a hook created unexpected commit content or history (${sha})`
    )
  }
  const indexTree = await privateGit(
    data,
    ['write-tree'],
    'assistedCommitVerifyHookIndex'
  )
  if (removeGitLineEnding(indexTree.stdout) !== tree) {
    throw new AssistedCommitError(
      'commit-failed',
      'A hook staged content outside the planned cumulative tree'
    )
  }
}

async function recover(
  data: IAssistedCommitData,
  created: ReadonlyArray<string>,
  expectedTip: string | null,
  installedIndex: IIndexState | undefined,
  lock: IOwnedIndexLock | undefined,
  options: IAssistedCommitExecutionOptions,
  ownedLocks: IOwnedFileLease[]
): Promise<IAssistedCommitRecovery> {
  const errors: unknown[] = []
  let history: IAssistedCommitRecovery['history'] = 'unchanged'
  let index: IAssistedCommitRecovery['index'] = 'unchanged'
  let attemptedIndexRestoration = false
  let observedHead: IAssistedCommitHead | null = null
  try {
    await options.onProgress?.({ kind: 'rolling-back' })
  } catch (error) {
    errors.push(error)
  }
  if (expectedTip !== data.snapshot.originalHead.sha && expectedTip !== null) {
    try {
      if (!created.includes(expectedTip)) {
        throw new AssistedCommitError(
          'recovery-failed',
          'Rollback tip is not owned by this run'
        )
      }
      const observed = await readHead(data.repository)
      const ownedTip =
        observed.ref === data.snapshot.originalHead.ref &&
        observed.sha !== null &&
        created.includes(observed.sha)
          ? observed.sha
          : expectedTip
      await updateRefWithVerification(
        data.repository,
        data.snapshot.originalHead.ref ?? 'HEAD',
        ownedTip,
        data.snapshot.originalHead.sha,
        'rollback: interrupted assisted commits',
        () => verifyHead(data, ownedTip)
      )
      await verifyHead(data, data.snapshot.originalHead.sha)
      history = 'restored'
    } catch (error) {
      errors.push(error)
      try {
        await verifyHead(data, data.snapshot.originalHead.sha)
        history = 'restored'
      } catch (observationError) {
        history = 'interfered'
        errors.push(observationError)
      }
    }
  } else {
    try {
      await verifyHead(data, data.snapshot.originalHead.sha)
    } catch (error) {
      history = 'interfered'
      errors.push(error)
    }
  }
  try {
    const current = await readIndexState(data.indexPath)
    if (!indexStatesEqual(current, data.originalIndex)) {
      if (history === 'interfered') {
        index = 'interfered'
        errors.push(
          new AssistedCommitError(
            'index-changed',
            'Recovery cannot restore the index while external history owns HEAD'
          )
        )
      } else if (
        installedIndex !== undefined &&
        indexStatesEqual(current, installedIndex)
      ) {
        const recoveryLock =
          lock === undefined || lock.consumed
            ? await lockIndex(data, owned => ownedLocks.push(owned))
            : lock
        try {
          await withRefLock(
            data.repository,
            data.snapshot.originalHead.ref ?? 'HEAD',
            data.snapshot.originalHead.sha ?? data.zeroId,
            async guard => {
              await verifyHead(data, data.snapshot.originalHead.sha)
              attemptedIndexRestoration = true
              await installIndex(
                data,
                recoveryLock,
                installedIndex,
                data.originalIndex,
                guard
              )
              index = 'restored'
            },
            owned => ownedLocks.push(owned)
          )
          await verifyHead(data, data.snapshot.originalHead.sha)
        } catch (error) {
          try {
            await verifyHead(data, data.snapshot.originalHead.sha)
          } catch (observationError) {
            history = 'interfered'
            errors.push(observationError)
          }
          throw error
        } finally {
          if (recoveryLock !== lock) {
            await releaseIndexLock(recoveryLock)
          }
        }
      } else {
        index = 'interfered'
        errors.push(
          new AssistedCommitError(
            'index-changed',
            'Recovery preserved an externally changed real index instead of overwriting it'
          )
        )
      }
    }
  } catch (error) {
    errors.push(error)
    try {
      const current = await readIndexState(data.indexPath)
      index = indexStatesEqual(current, data.originalIndex)
        ? attemptedIndexRestoration
          ? 'restored'
          : 'unchanged'
        : 'interfered'
    } catch (observationError) {
      index = 'interfered'
      errors.push(observationError)
    }
  }
  try {
    observedHead = await readHead(data.repository)
  } catch (error) {
    errors.push(error)
  }
  return Object.freeze({
    snapshot: data.snapshot,
    createdCommits: Object.freeze([...created]),
    expectedTip,
    observedHead,
    history,
    index,
    errors: Object.freeze(errors),
  })
}

/**
 * Execute a fully validated plan using private HEAD/index metadata.
 *
 * Git owns hook execution, message formatting, sign-off, and commit objects.
 * Desktop verifies each resulting tree and parent before publishing it with a
 * guarded ref transaction. The real index stays untouched until final success.
 *
 * Cancellation waits for in-flight Git to settle, then recovers every published
 * run commit. Working-tree bytes are never restored, including hook edits.
 * This consumes/disposes the snapshot on either success or executor failure.
 */
export async function executeAssistedCommitPlan(
  snapshot: IAssistedCommitSnapshot,
  validated: IValidatedAssistedCommitPlan,
  options: IAssistedCommitExecutionOptions = {}
): Promise<IAssistedCommitResult> {
  const data = getSnapshotData(snapshot)
  if (data.phase !== 'captured') {
    throw new AssistedCommitError(
      'busy',
      'The assisted commit snapshot is already in use'
    )
  }
  if (validatedPlans.get(validated) !== data) {
    throw new AssistedCommitError(
      'invalid-plan',
      'Executor requires a Desktop-validated plan for this snapshot'
    )
  }
  data.phase = 'executing'
  const created: string[] = []
  let expectedTip = snapshot.originalHead.sha
  let lock: IOwnedIndexLock | undefined
  let installedIndex: IIndexState | undefined
  const ownedLocks: IOwnedFileLease[] = []
  const callbackErrors: unknown[] = []
  let hookAborted = false
  try {
    checkAssistedCommitCancellation(options.signal)
    await verifyHead(data, expectedTip)
    await verifyIndex(data)
    await verifySelectedFiles(data)
    await ensureNoRepositoryOperation(data.repository)
    const messages: string[] = []
    for (const commit of validated.plan.commits) {
      checkAssistedCommitCancellation(options.signal)
      messages.push(
        await formatCommitMessage(
          data.repository,
          {
            summary: commit.title,
            description: commit.description ?? '',
            trailers: data.request.trailers,
          },
          { env: data.environment }
        )
      )
    }
    checkAssistedCommitCancellation(options.signal)
    lock = await lockIndex(data, owned => ownedLocks.push(owned))
    await verifyIndex(data)
    for (const [index, commit] of validated.plan.commits.entries()) {
      const tree = validated.trees[index]
      await options.onProgress?.({
        kind: 'committing',
        index,
        total: messages.length,
        title: commit.title,
      })
      checkAssistedCommitCancellation(options.signal)
      await verifyHead(data, expectedTip)
      await verifyIndex(data)
      await verifySelectedFiles(data)
      await ensureNoRepositoryOperation(data.repository)
      if ((await privateTip(data)) !== expectedTip) {
        throw new AssistedCommitError(
          'commit-failed',
          'The private transaction HEAD changed unexpectedly'
        )
      }
      const configuration = [
        '-c',
        `core.hooksPath=${join(data.temporaryDirectory, 'no-hooks')}`,
      ]
      await privateGit(
        data,
        [...configuration, 'read-tree', tree],
        'assistedCommitPrepareCommit'
      )
      checkAssistedCommitCancellation(options.signal)
      const args = [
        'commit',
        '-F',
        '-',
        ...(data.request.skipCommitHooks ? ['--no-verify'] : []),
        ...(data.request.signOffCommits ? ['--signoff'] : []),
        ...(snapshot.analysis.changes.length === 0 &&
        data.request.allowEmptyCommit
          ? ['--allow-empty']
          : []),
      ]
      let commitError: unknown
      try {
        await privateGit(data, args, 'assistedCommitCreateCommit', {
          stdin: messages[index],
          interceptHooks: [
            'pre-commit',
            'prepare-commit-msg',
            'commit-msg',
            'post-commit',
            'pre-auto-gc',
          ],
          onHookProgress: progress => {
            try {
              options.onHookProgress?.(progress)
            } catch (error) {
              callbackErrors.push(error)
            }
          },
          onHookFailure:
            options.onHookFailure === undefined
              ? undefined
              : async (name, output) => {
                  const cancelled = () => options.signal?.aborted === true
                  if (cancelled()) {
                    return 'abort'
                  }
                  try {
                    const result = await options.onHookFailure?.(name, output)
                    hookAborted = result === 'abort'
                    return cancelled() || result !== 'ignore'
                      ? 'abort'
                      : 'ignore'
                  } catch (error) {
                    callbackErrors.push(error)
                    return 'abort'
                  }
                },
          onTerminalOutputAvailable: subscribe => {
            try {
              options.onTerminalOutputAvailable?.(subscribe)
            } catch (error) {
              callbackErrors.push(error)
            }
          },
        })
      } catch (error) {
        commitError = error
      }
      // Even a failing command can have advanced its private ref. Always observe
      // it after Git settles; never infer ownership from commit's console output.
      const sha = await privateTip(data)
      if (sha !== null && sha !== expectedTip) {
        await verifyCreatedCommit(data, sha, expectedTip, tree)
        created.push(sha)
      }
      checkAssistedCommitCancellation(options.signal)
      if (
        commitError !== undefined ||
        callbackErrors.length > 0 ||
        sha === null ||
        sha === expectedTip
      ) {
        throw new AssistedCommitError(
          hookAborted ? 'hook-aborted' : 'commit-failed',
          hookAborted
            ? 'Commit hook failure was declined'
            : 'Git could not create the planned assisted commit',
          {
            cause:
              callbackErrors.length === 0
                ? commitError
                : new AggregateError([commitError, ...callbackErrors]),
          }
        )
      }
      await verifySelectedFiles(data)
      await verifyIndex(data)
      const previousTip = expectedTip
      expectedTip = sha
      try {
        await updateRefWithVerification(
          data.repository,
          snapshot.originalHead.ref ?? 'HEAD',
          previousTip ?? data.zeroId,
          sha,
          `commit: ${commit.title}`,
          async () => {
            await verifyHead(data, previousTip)
            await verifyIndex(data)
            await verifySelectedFiles(data)
            checkAssistedCommitCancellation(options.signal)
          }
        )
      } catch (error) {
        try {
          const observed = await readHead(data.repository)
          if (
            observed.ref === snapshot.originalHead.ref &&
            observed.sha === previousTip
          ) {
            expectedTip = previousTip
          }
        } catch (observationError) {
          throw new AggregateError(
            [error, observationError],
            'Publication failed and its outcome could not be observed'
          )
        }
        throw error
      }
      await verifyHead(data, expectedTip)
      await verifyIndex(data)
      await verifySelectedFiles(data)
      await options.onProgress?.({
        kind: 'committed',
        index,
        total: messages.length,
        sha,
      })
      checkAssistedCommitCancellation(options.signal)
    }
    const finalIndexPath = join(data.temporaryDirectory, 'final-index')
    const configuration = [
      '-c',
      `core.hooksPath=${join(data.temporaryDirectory, 'no-hooks')}`,
    ]
    await privateGit(
      data,
      [...configuration, 'read-tree', snapshot.selectedTree],
      'assistedCommitFinalIndex',
      {
        env: { GIT_INDEX_FILE: finalIndexPath },
      }
    )
    const finalTree = await privateGit(
      data,
      [...configuration, 'write-tree'],
      'assistedCommitCheckFinalIndex',
      {
        env: { GIT_INDEX_FILE: finalIndexPath },
      }
    )
    if (removeGitLineEnding(finalTree.stdout) !== snapshot.selectedTree) {
      throw new AssistedCommitError(
        'commit-failed',
        'A hook changed the final index synchronization tree'
      )
    }
    await verifyHead(data, expectedTip)
    await verifySelectedFiles(data)
    checkAssistedCommitCancellation(options.signal)
    installedIndex = {
      bytes: await readFile(finalIndexPath),
      mode:
        data.originalIndex.bytes === null
          ? lock.stat.mode & 0o777
          : data.originalIndex.mode,
    }
    const finalLock = lock
    const finalIndex = installedIndex
    await withRefLock(
      data.repository,
      snapshot.originalHead.ref ?? 'HEAD',
      expectedTip ?? data.zeroId,
      async guard => {
        await verifyHead(data, expectedTip)
        await verifySelectedFiles(data)
        checkAssistedCommitCancellation(options.signal)
        await installIndex(
          data,
          finalLock,
          data.originalIndex,
          finalIndex,
          guard
        )
      },
      owned => ownedLocks.push(owned)
    )
    await verifyHead(data, expectedTip)
    await verifyIndex(data, installedIndex)
    await verifySelectedFiles(data)
    checkAssistedCommitCancellation(options.signal)
    await releaseIndexLock(lock)
    lock = undefined
    data.phase = 'captured'
    await disposeAssistedCommitSnapshot(snapshot)
    checkAssistedCommitCancellation(options.signal)
    const result = Object.freeze({
      snapshot,
      commits: Object.freeze(created),
      head: Object.freeze({ ref: snapshot.originalHead.ref, sha: expectedTip }),
      tree: snapshot.selectedTree,
    })
    completedTransactions.set(result, {
      data,
      created: result.commits,
      installedIndex,
      ownedLocks,
      expectedTip,
      recovering: false,
    })
    return result
  } catch (error) {
    const cleanupErrors: unknown[] = [
      ...(await cleanupOwnedLocks(ownedLocks.filter(owned => owned !== lock))),
    ]
    const recovery = await recover(
      data,
      created,
      expectedTip,
      installedIndex,
      lock,
      options,
      ownedLocks
    )
    cleanupErrors.push(...(await cleanupOwnedLocks(ownedLocks)))

    data.phase = 'captured'
    try {
      await disposeAssistedCommitSnapshot(snapshot)
    } catch (cleanup) {
      cleanupErrors.push(cleanup)
    }
    const allErrors = [...recovery.errors, ...cleanupErrors]
    const retryToken: IAssistedCommitRecoveryToken | undefined =
      allErrors.length === 0
        ? undefined
        : Object.freeze({ snapshotId: snapshot.id })
    if (retryToken !== undefined) {
      completedTransactions.set(retryToken, {
        data,
        created: Object.freeze([...created]),
        installedIndex,
        ownedLocks,
        expectedTip:
          recovery.history === 'restored'
            ? snapshot.originalHead.sha
            : expectedTip,
        recovering: false,
      })
    }
    const fullRecovery = Object.freeze({
      ...recovery,
      errors: Object.freeze(allErrors),
      ...(retryToken === undefined ? {} : { retryToken }),
    })
    throw new AssistedCommitError(
      allErrors.length > 0
        ? 'recovery-failed'
        : error instanceof AssistedCommitError
        ? error.code
        : 'commit-failed',
      allErrors.length > 0
        ? 'Assisted commit interrupted; external interference or cleanup failure prevented complete recovery'
        : error instanceof Error
        ? error.message
        : 'Assisted commit failed',
      { cause: error, recovery: fullRecovery }
    )
  }
}

/**
 * Roll back a completed local run that has not crossed the caller's push boundary.
 *
 * Successful execution leaves no private files. Recovery tokens also retain
 * failed owned-resource cleanup until retry succeeds. The original index backup
 * remains until recovery or explicit finalization.
 * Ref and index ownership are checked again; external edits are never overwritten.
 * Cancellation cannot interrupt recovery itself.
 */
export async function rollbackAssistedCommitTransaction(
  result: AssistedCommitRecoveryCapability,
  options: IAssistedCommitOperationOptions = {}
): Promise<IAssistedCommitRecovery> {
  const transaction = completedTransactions.get(result)
  if (transaction === undefined) {
    throw new AssistedCommitError(
      'disposed',
      'Assisted commit transaction was finalized or is not Desktop-owned'
    )
  }
  if (transaction.recovering) {
    throw new AssistedCommitError(
      'busy',
      'Assisted commit recovery is already in progress'
    )
  }
  transaction.recovering = true
  try {
    const cleanupErrors: unknown[] = [
      ...(await cleanupOwnedLocks(transaction.ownedLocks)),
    ]
    const recovery = await recover(
      transaction.data,
      transaction.created,
      transaction.expectedTip,
      transaction.installedIndex,
      undefined,
      options,
      transaction.ownedLocks
    )
    cleanupErrors.push(...(await cleanupOwnedLocks(transaction.ownedLocks)))
    if (!disposedSnapshots.has(transaction.data.snapshot)) {
      try {
        await disposeAssistedCommitSnapshot(transaction.data.snapshot)
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
    const fullRecovery = Object.freeze({
      ...recovery,
      errors: Object.freeze([...recovery.errors, ...cleanupErrors]),
    })
    if (recovery.history === 'restored') {
      transaction.expectedTip = transaction.data.snapshot.originalHead.sha
    }
    if (fullRecovery.errors.length > 0) {
      throw new AssistedCommitError(
        'recovery-failed',
        'External interference or owned-resource cleanup failure prevented complete assisted commit recovery',
        {
          recovery: fullRecovery,
          cause: new AggregateError(fullRecovery.errors),
        }
      )
    }
    completedTransactions.delete(result)
    finalizedTransactions.add(result)
    return fullRecovery
  } finally {
    transaction.recovering = false
  }
}

/**
 * Accept completed local commits and release the in-memory rollback capability.
 *
 * Call when returning to ready state or immediately before starting a push, after
 * checking cancellation. This performs no Git operation and is safe to call twice.
 */
export function finalizeAssistedCommitTransaction(
  result: AssistedCommitRecoveryCapability
): void {
  const transaction = completedTransactions.get(result)
  if (transaction === undefined) {
    if (finalizedTransactions.has(result)) {
      return
    }
    throw new AssistedCommitError(
      'disposed',
      'Assisted commit result is not Desktop-owned'
    )
  }
  if (transaction.recovering) {
    throw new AssistedCommitError(
      'busy',
      'Cannot finalize an active assisted commit recovery'
    )
  }
  if (
    transaction.ownedLocks.some(lock => !lock.closed || !lock.consumed) ||
    !disposedSnapshots.has(transaction.data.snapshot)
  ) {
    throw new AssistedCommitError(
      'cleanup-failed',
      'Retry assisted commit recovery before finalizing unresolved owned resources'
    )
  }
  completedTransactions.delete(result)
  finalizedTransactions.add(result)
}
