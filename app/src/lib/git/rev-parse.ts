import { git } from './core'
import { directoryExists } from '../directory-exists'
import { resolve } from 'path'

export type RepositoryType =
  | { kind: 'bare' }
  | { kind: 'regular'; topLevelWorkingDirectory: string }
  | { kind: 'missing' }
  | { kind: 'unsafe'; path: string }

/**
 * Attempts to fulfill the work of isGitRepository and isBareRepository while
 * requiring only one Git process to be spawned.
 *
 * Returns 'bare', 'regular', or 'missing' if the repository couldn't be
 * found.
 */
export async function getRepositoryType(path: string): Promise<RepositoryType> {
  if (!(await directoryExists(path))) {
    return { kind: 'missing' }
  }

  try {
    const result = await git(
      ['rev-parse', '--is-bare-repository', '--show-cdup'],
      path,
      'getRepositoryType',
      { successExitCodes: new Set([0, 128]) }
    )

    if (result.exitCode === 0) {
      const [isBare, cdup] = result.stdout.split('\n', 2)

      return isBare === 'true'
        ? { kind: 'bare' }
        : { kind: 'regular', topLevelWorkingDirectory: resolve(path, cdup) }
    }

    const unsafeMatch =
      /fatal: detected dubious ownership in repository at '(.+)'/.exec(
        result.stderr
      )
    if (unsafeMatch) {
      return { kind: 'unsafe', path: unsafeMatch[1] }
    }

    return { kind: 'missing' }
  } catch (err) {
    // This could theoretically mean that the Git executable didn't exist but
    // in reality it's almost always going to be that the process couldn't be
    // launched inside of `path` meaning it didn't exist. This would constitute
    // a race condition given that we stat the path before executing Git.
    if (err.code === 'ENOENT') {
      return { kind: 'missing' }
    }
    throw err
  }
}

export async function getUpstreamRefForRef(path: string, ref?: string) {
  const rev = (ref ?? '') + '@{upstream}'
  const args = ['rev-parse', '--symbolic-full-name', rev]
  const opts = { successExitCodes: new Set([0, 128]) }
  const result = await git(args, path, 'getUpstreamRefForRef', opts)

  return result.exitCode === 0 ? result.stdout.trim() : null
}

export async function getUpstreamRemoteNameForRef(path: string, ref?: string) {
  const remoteRef = await getUpstreamRefForRef(path, ref)
  return remoteRef?.match(/^refs\/remotes\/([^/]+)\//)?.[1] ?? null
}

export const getCurrentUpstreamRef = (path: string) =>
  getUpstreamRefForRef(path)

export const getCurrentUpstreamRemoteName = (path: string) =>
  getUpstreamRemoteNameForRef(path)
