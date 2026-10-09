import {
  BigIntStats,
  lstatSync,
  realpathSync,
  readdirSync,
  opendirSync,
} from 'fs'
import { lstat, realpath } from 'fs/promises'
import { isErrnoException } from '../errno-exception'
import { basename, dirname, join } from 'path'

/** A certified identity/version changed, distinct from an unexpected I/O failure. */
export class AssistedCommitFileVersionMismatchError extends Error {
  /** Identify the backing path whose certification expired. */
  public constructor(path: string, options?: ErrorOptions) {
    super(`Repository metadata changed before push entry: ${path}`, options)
    this.name = 'AssistedCommitFileVersionMismatchError'
  }
}

/** Proven invalid path topology is distinct from unexpected or transient I/O. */
export function isAssistedCommitPathLayoutError(error: unknown): boolean {
  return (
    isErrnoException(error) &&
    (error.code === 'ENOTDIR' || error.code === 'ELOOP')
  )
}

function version(stat: BigIntStats | null): string {
  return stat === null
    ? 'missing'
    : [
        stat.dev,
        stat.ino,
        stat.mode,
        ...(stat.isDirectory() ? [] : [stat.size, stat.mtimeNs, stat.ctimeNs]),
      ].join(':')
}

async function optionalStat(path: string): Promise<BigIntStats | null> {
  try {
    return await lstat(path, { bigint: true })
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return null
    }
    if (isAssistedCommitPathLayoutError(error)) {
      throw new AssistedCommitFileVersionMismatchError(path, { cause: error })
    }
    throw error
  }
}

/**
 * Certify backing metadata across awaited verification and a non-yielding entry.
 *
 * Directory contents may change independently; only their identity is fenced.
 * This does not replace content/ref verification or grant Git ownership.
 */
export async function captureFileVersionFence(
  paths: ReadonlyArray<string>
): Promise<() => void> {
  const files = await Promise.all(
    [...new Set(paths)].map(async path => {
      const stat = await optionalStat(path)
      let physical: string | null
      try {
        physical = stat === null ? null : await realpath(path)
      } catch (error) {
        if (
          (isErrnoException(error) && error.code === 'ENOENT') ||
          isAssistedCommitPathLayoutError(error)
        ) {
          throw new AssistedCommitFileVersionMismatchError(path, {
            cause: error,
          })
        }
        throw error
      }
      return {
        path,
        version: version(stat),
        physical,
        targetVersion:
          physical === null
            ? version(null)
            : version(await optionalStat(physical)),
      }
    })
  )
  return function verifyFileVersionsSync() {
    for (const file of files) {
      let stat: BigIntStats | null
      try {
        // eslint-disable-next-line no-sync
        stat = lstatSync(file.path, { bigint: true })
      } catch (error) {
        if (isErrnoException(error) && error.code === 'ENOENT') {
          stat = null
        } else {
          if (isAssistedCommitPathLayoutError(error)) {
            throw new AssistedCommitFileVersionMismatchError(file.path, {
              cause: error,
            })
          }
          throw error
        }
      }
      let physical: string | null
      let target: BigIntStats | null
      try {
        // eslint-disable-next-line no-sync
        physical = stat === null ? null : realpathSync.native(file.path)
        // eslint-disable-next-line no-sync
        target =
          physical === null ? null : lstatSync(physical, { bigint: true })
      } catch (error) {
        if (
          (isErrnoException(error) && error.code === 'ENOENT') ||
          isAssistedCommitPathLayoutError(error)
        ) {
          throw new AssistedCommitFileVersionMismatchError(file.path, {
            cause: error,
          })
        }
        throw error
      }
      if (
        version(stat) !== file.version ||
        physical !== file.physical ||
        version(target) !== file.targetVersion
      ) {
        throw new AssistedCommitFileVersionMismatchError(file.path)
      }
    }
  }
}

/**
 * Certify mutable native metadata without freezing its contents or owned replacements.
 *
 * Symlinks and shared hard links are unsupported; parent routing stays fixed.
 */
export async function captureMutableFileRoutingFence(
  paths: ReadonlyArray<string>
): Promise<() => void> {
  const verifyParents = await captureFileVersionFence(
    paths.map(path => dirname(path))
  )
  const files = await Promise.all(
    [...new Set(paths)].map(async path => ({
      path,
      physical: join(await realpath(dirname(path)), basename(path)),
    }))
  )
  const verify = () => {
    verifyParents()
    for (const file of files) {
      let stat: BigIntStats
      try {
        // eslint-disable-next-line no-sync
        stat = lstatSync(file.path, { bigint: true })
      } catch (error) {
        if (isErrnoException(error) && error.code === 'ENOENT') {
          continue
        }
        if (isAssistedCommitPathLayoutError(error)) {
          throw new AssistedCommitFileVersionMismatchError(file.path, {
            cause: error,
          })
        }
        throw error
      }
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.nlink !== BigInt(1) ||
        // eslint-disable-next-line no-sync
        realpathSync.native(file.path) !== file.physical
      ) {
        throw new AssistedCommitFileVersionMismatchError(file.path)
      }
    }
  }
  verify()
  return verify
}

/** Certify ref/reflog tree routing without freezing legitimate files or directory creation. */
export async function captureMutableTreeRoutingFence(
  paths: ReadonlyArray<string>
): Promise<() => void> {
  return captureTreeRoutingFence(paths, false)
}

/** Certify object-store routes while allowing native immutable object hard links. */
export async function captureObjectDirectoryRoutingFence(
  paths: ReadonlyArray<string>
): Promise<() => void> {
  return captureTreeRoutingFence(paths, true)
}

async function captureTreeRoutingFence(
  paths: ReadonlyArray<string>,
  allowHardLinks: boolean
): Promise<() => void> {
  const verifyParents = await captureFileVersionFence(
    paths.map(path => dirname(path))
  )
  const verify = () => {
    verifyParents()
    const pending = [...new Set(paths)]
    let inspected = 0
    const checkBudget = (path: string) => {
      if (allowHardLinks && ++inspected > 4096) {
        throw new AssistedCommitFileVersionMismatchError(path, {
          cause: new Error(
            'Object routing exceeds the 4096-entry certification budget'
          ),
        })
      }
    }
    while (pending.length > 0) {
      const path = pending.pop()
      if (path === undefined) {
        break
      }
      try {
        checkBudget(path)
        // eslint-disable-next-line no-sync
        const stat = lstatSync(path, { bigint: true })
        if (
          stat.isSymbolicLink() ||
          (!stat.isDirectory() &&
            (!stat.isFile() || (!allowHardLinks && stat.nlink !== BigInt(1))))
        ) {
          throw new AssistedCommitFileVersionMismatchError(path)
        }
        if (stat.isDirectory()) {
          if (allowHardLinks) {
            // eslint-disable-next-line no-sync
            const directory = opendirSync(path)
            try {
              // eslint-disable-next-line no-sync
              let child = directory.readSync()
              while (child !== null) {
                checkBudget(path)
                pending.push(join(path, child.name))
                // eslint-disable-next-line no-sync
                child = directory.readSync()
              }
            } finally {
              // eslint-disable-next-line no-sync
              directory.closeSync()
            }
          } else {
            // eslint-disable-next-line no-sync
            for (const child of readdirSync(path)) {
              pending.push(join(path, child))
            }
          }
        }
      } catch (error) {
        if (isErrnoException(error) && error.code === 'ENOENT') {
          continue
        }
        if (isAssistedCommitPathLayoutError(error)) {
          throw new AssistedCommitFileVersionMismatchError(path, {
            cause: error,
          })
        }
        throw error
      }
    }
  }
  verify()
  return verify
}
