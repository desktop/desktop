import { Stats } from 'fs'
import { FileHandle, lstat, open, unlink } from 'fs/promises'
import { isErrnoException } from '../errno-exception'

/** Ownership registered immediately after exclusive creation, before stat. */
export interface IOwnedFileLease {
  /** Absolute filesystem lock path. */
  readonly path: string
  /** Exclusively created handle, owned until cleanup finishes. */
  readonly handle: FileHandle
  /** Device/inode identity used to avoid removing a replacement lock. */
  stat: Stats | undefined
  /** Whether the owned handle was successfully closed. */
  closed: boolean
  /** Whether this process removed/installed the path or lost ownership of it. */
  consumed: boolean
}

/** An initialized exclusive lock with a known owned inode. */
export interface IOwnedFileLock extends IOwnedFileLease {
  /** Device/inode identity established during initialization. */
  stat: Stats
}

/** Close and remove only an owned lock, retaining failed steps for retry. */
export async function releaseOwnedFileLock(
  lock: IOwnedFileLease
): Promise<void> {
  const errors: unknown[] = []
  if (!lock.consumed && lock.stat === undefined) {
    try {
      lock.stat = await lock.handle.stat()
    } catch (error) {
      throw new AggregateError(
        [error],
        `Could not establish owned file lock identity for cleanup: ${lock.path}`
      )
    }
  }
  if (!lock.closed) {
    try {
      await lock.handle.close()
      lock.closed = true
    } catch (error) {
      errors.push(error)
    }
  }
  if (!lock.consumed) {
    try {
      const current = await lstat(lock.path)
      if (
        lock.stat === undefined ||
        current.ino !== lock.stat.ino ||
        current.dev !== lock.stat.dev
      ) {
        lock.consumed = true
        throw new Error(`Owned file lock was replaced: ${lock.path}`)
      }
      await unlink(lock.path)
      lock.consumed = true
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ENOENT') {
        lock.consumed = true
      }
      errors.push(error)
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(
      errors,
      `Could not release owned file lock completely: ${lock.path}`
    )
  }
}

/** Acquire an exclusive lock, safely unwinding failures during initialization. */
export async function acquireOwnedFileLock(
  path: string,
  mode: number = 0o666,
  onOwnershipAcquired?: (lease: IOwnedFileLease) => void
): Promise<IOwnedFileLock> {
  const handle = await open(path, 'wx', mode)
  const lease: IOwnedFileLease = {
    path,
    handle,
    stat: undefined,
    closed: false,
    consumed: false,
  }
  try {
    onOwnershipAcquired?.(lease)
    return Object.assign(lease, { stat: await handle.stat() })
  } catch (error) {
    try {
      await releaseOwnedFileLock(lease)
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        `Could not unwind lock initialization: ${path}`
      )
    }
    throw error
  }
}
