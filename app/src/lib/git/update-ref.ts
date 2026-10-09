import { git } from './core'
import { Repository } from '../../models/repository'
import { ChildProcess } from 'child_process'
import { mkdir } from 'fs/promises'
import { dirname } from 'path'
import {
  acquireOwnedFileLock,
  IOwnedFileLease,
  releaseOwnedFileLock,
} from './owned-file-lock'

/** Liveness of owned ref/HEAD locks across asynchronous guarded work. */
export interface IRefLock {
  /** Aborted when the lock owner fails before guarded work settles. */
  readonly signal: AbortSignal
  /** Throw before a mutation if the prepared ref guard is no longer alive. */
  readonly assertHeld: () => void
}

/**
 * Update the ref to a new value.
 *
 * @param repository - The repository in which the ref exists.
 * @param ref        - The ref to update. Must be fully qualified
 *                     (e.g., `refs/heads/NAME`).
 * @param oldValue   - The value we expect the ref to have currently. If it
 *                     doesn't match, the update will be aborted.
 * @param newValue   - The new value for the ref.
 * @param reason     - The reflog entry.
 */
export async function updateRef(
  repository: Repository,
  ref: string,
  oldValue: string,
  newValue: string,
  reason: string
): Promise<void> {
  await git(
    ['update-ref', ref, newValue, oldValue, '-m', reason],
    repository.path,
    'updateRef'
  )
}

/**
 * Compare-and-swap a ref after verifying state while Git holds its ref locks.
 *
 * Unlike a read followed by updateRef, this also lets the caller verify HEAD's
 * symbolic identity under Git's implicit HEAD lock. The verifier must only read
 * repository state; it must not try to acquire the same ref locks.
 *
 * A null new value deletes an existing ref with an old-value guard.
 */
export async function updateRefWithVerification(
  repository: Repository,
  ref: string,
  oldValue: string,
  newValue: string | null,
  reason: string,
  verify: () => Promise<void>
): Promise<void> {
  const command =
    newValue === null
      ? `delete ${ref}\0${oldValue}\0`
      : `update ${ref}\0${newValue}\0${oldValue}\0`
  return preparedRefTransaction(repository, command, verify, 'commit', reason)
}

/**
 * Hold parent-owned file-backend HEAD/ref locks during guarded non-ref work.
 *
 * Locks remain owned by this process until all awaited work settles, including
 * dispatched filesystem mutations. No Git child lifetime can release them.
 * No ref/reflog is written. Use a zero object ID for an unborn ref.
 * onLockAcquired registers ownership before stat, retaining initialization
 * cleanup for a later retry if identity or filesystem cleanup is unavailable.
 */
export async function withRefLock(
  repository: Repository,
  ref: string,
  value: string,
  action: (lock: IRefLock) => Promise<void>,
  onLockAcquired?: (lease: IOwnedFileLease) => void
): Promise<void> {
  const format = await git(
    ['rev-parse', '--show-ref-format'],
    repository.path,
    'withRefLock'
  )
  if (format.stdout.replace(/\r?\n$/, '') !== 'files') {
    throw new Error('Parent-owned ref locks require file-backed Git refs')
  }
  if (ref !== 'HEAD' && !ref.startsWith('refs/heads/')) {
    throw new Error(
      'Parent-owned ref locks require HEAD or a fully qualified branch'
    )
  }
  const paths = ref === 'HEAD' ? ['HEAD'] : ['HEAD', ref]
  const locks = []
  let active = true
  const controller = new AbortController()
  const guard: IRefLock = {
    signal: controller.signal,
    assertHeld: () => {
      if (!active || controller.signal.aborted) {
        throw new Error('Parent-owned HEAD/ref guard is no longer held', {
          cause: controller.signal.reason,
        })
      }
    },
  }
  let failure: unknown
  let failed = false
  try {
    for (const name of paths) {
      const result = await git(
        ['rev-parse', '--path-format=absolute', '--git-path', name],
        repository.path,
        'withRefLockPath'
      )
      const path = `${result.stdout.replace(/\r?\n$/, '')}.lock`
      await mkdir(dirname(path), { recursive: true })
      const owned = await acquireOwnedFileLock(path, undefined, onLockAcquired)
      locks.push(owned)
    }
    const current = await git(
      [
        'rev-parse',
        '--verify',
        '--quiet',
        '--end-of-options',
        `${ref}^{commit}`,
      ],
      repository.path,
      'withRefLockValue',
      { successExitCodes: new Set([0, 1]) }
    )
    const actual =
      current.exitCode === 0
        ? current.stdout.replace(/\r?\n$/, '')
        : '0'.repeat(value.length)
    if (actual !== value) {
      throw new Error(`Ref changed before guarded index work: ${ref}`)
    }
    await action(guard)
  } catch (error) {
    failed = true
    failure = error
    controller.abort(error)
  } finally {
    active = false
    const cleanupErrors: unknown[] = []
    for (const lock of [...locks].reverse()) {
      try {
        await releaseOwnedFileLock(lock)
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        failed ? [failure, ...cleanupErrors] : cleanupErrors,
        'Could not release parent-owned ref locks'
      )
    }
  }
  if (failed) {
    throw failure
  }
}

async function preparedRefTransaction(
  repository: Repository,
  command: string,
  action: (lock: IRefLock) => Promise<void>,
  completion: 'commit' | 'abort',
  reason?: string
): Promise<void> {
  let verification: Promise<void> | undefined
  let verificationError: unknown
  let verificationFailed = false
  let prepared = false
  let protocol = ''
  let child: ChildProcess | undefined
  let completionRequested = false
  const controller = new AbortController()
  const lock: IRefLock = {
    signal: controller.signal,
    assertHeld: () => {
      if (
        controller.signal.aborted ||
        !prepared ||
        child === undefined ||
        child.exitCode !== null ||
        child.signalCode !== null
      ) {
        throw new Error('Git ref guard was lost during guarded work', {
          cause: controller.signal.reason,
        })
      }
    },
  }
  let gitError: unknown
  let gitFailed = false

  // -z avoids quoting or interpreting ref names. Options apply to the next
  // ref command only. no-deref protects against a concurrent symbolic alias.
  try {
    await git(
      [
        'update-ref',
        ...(reason === undefined ? [] : ['-m', reason]),
        '--stdin',
        '-z',
      ],
      repository.path,
      'updateRefWithVerification',
      {
        processCallback: process => {
          child = process
          process.once('exit', () => {
            if (!completionRequested) {
              controller.abort(
                new Error('Git exited before guarded work settled')
              )
            }
          })
          const input = process.stdin
          if (input === null) {
            verificationError = new Error('Git ref transaction has no stdin')
            verificationFailed = true
            return
          }

          process.stdout?.on('data', (chunk: Buffer) => {
            protocol += chunk.toString('utf8')
            if (!prepared && /(?:^|\n)prepare: ok\r?\n/.test(protocol)) {
              prepared = true
              verification = (async () => {
                try {
                  lock.assertHeld()
                  await action(lock)
                  lock.assertHeld()
                } catch (error) {
                  verificationError = error
                  verificationFailed = true
                }
                completionRequested = true
                if (process.exitCode === null && process.signalCode === null) {
                  input.end(`${verificationFailed ? 'abort' : completion}\0`)
                }
              })()
            }
          })
          input.write(`start\0option no-deref\0${command}prepare\0`)
        },
      }
    )
  } catch (error) {
    gitError = error
    gitFailed = true
    controller.abort(error)
  }

  await verification
  if (gitFailed) {
    throw verificationFailed
      ? new AggregateError(
          [gitError, verificationError],
          'Git ref guard and guarded work failed'
        )
      : gitError
  }
  if (verificationFailed) {
    throw verificationError
  }
  if (!prepared) {
    throw new Error('Git ref transaction did not prepare')
  }
}

/**
 * Remove a ref.
 *
 * @param repository - The repository in which the ref exists.
 * @param ref        - The ref to remove. Should be fully qualified, but may also be 'HEAD'.
 * @param reason     - The reflog entry (optional). Note that this is only useful when
 *                     deleting the HEAD reference as deleting any other reference will
 *                     implicitly delete the reflog file for that reference as well.
 */
export async function deleteRef(
  repository: Repository,
  ref: string,
  reason?: string
) {
  const args = ['update-ref', '-d', ref]

  if (reason !== undefined) {
    args.push('-m', reason)
  }

  await git(args, repository.path, 'deleteRef')
}
