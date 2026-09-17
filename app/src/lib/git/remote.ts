import { git } from './core'
import { GitError } from 'dugite'

import { Repository } from '../../models/repository'
import { IRemote } from '../../models/remote'
import { envForRemoteOperation } from './environment'
import { getSymbolicRef } from './refs'

/**
 * List the remotes, sorted alphabetically by `name`, for a repository.
 *
 * Returns the first fetch URL for each remote, with Git's URL rewrites applied.
 * Remotes without a fetch URL are omitted.
 */
export async function getRemotes(
  repository: Repository
): Promise<ReadonlyArray<IRemote>> {
  // Config queries also work outside repositories. Check the repository first.
  const result = await git(
    ['rev-parse', '--git-dir'],
    repository.path,
    'getRemotes',
    { expectedErrors: new Set([GitError.NotAGitRepository]) }
  )

  if (result.gitError === GitError.NotAGitRepository) {
    return []
  }

  const config = await git(
    ['config', '--null', '--get-regexp', '^remote\\..+\\.url$'],
    repository.path,
    'getRemotes',
    { successExitCodes: new Set([0, 1]) }
  )

  const names = new Set<string>()
  for (const entry of config.stdout.split('\0').slice(0, -1)) {
    // Git separates the key from its value with LF, and records with NUL.
    const separator = entry.indexOf('\n')
    if (separator === -1) {
      throw new Error('Remote URL configuration is missing a value')
    }

    const name = entry.slice('remote.'.length, separator - '.url'.length)
    if (entry.slice(separator + 1).length === 0) {
      // An empty URL entry clears any URLs previously configured for this remote.
      names.delete(name)
    } else {
      names.add(name)
    }
  }

  const remotes: IRemote[] = []
  for (const name of [...names].sort()) {
    // Unlike remote get-url, this also resolves globally configured remotes.
    // --get-url does not contact the remote.
    const { stdout } = await git(
      ['ls-remote', '--get-url', '--', name],
      repository.path,
      'getRemotes'
    )
    remotes.push({ name, url: stdout.slice(0, -1) })
  }

  return remotes
}

/** Add a new remote with the given URL. */
export async function addRemote(
  repository: Repository,
  name: string,
  url: string
): Promise<IRemote> {
  await git(['remote', 'add', '--', name, url], repository.path, 'addRemote')

  return { url, name }
}

/** Removes an existing remote, or silently errors if it doesn't exist */
export async function removeRemote(
  repository: Repository,
  name: string
): Promise<void> {
  const options = {
    successExitCodes: new Set([0, 2, 128]),
  }

  await git(
    ['remote', 'remove', '--', name],
    repository.path,
    'removeRemote',
    options
  )
}

/** Changes the URL for the remote that matches the given name  */
export async function setRemoteURL(
  repository: Repository,
  name: string,
  url: string
): Promise<true> {
  await git(
    ['remote', 'set-url', '--', name, url],
    repository.path,
    'setRemoteURL'
  )
  return true
}

/**
 * Get the first fetch URL for the remote, with Git's URL rewrites applied.
 *
 * Returns null if the remote could not be found. The returned URL excludes
 * Git's output terminator but preserves whitespace belonging to the URL.
 */
export async function getRemoteURL(
  repository: Repository,
  name: string
): Promise<string | null> {
  const result = await git(
    ['remote', 'get-url', '--', name],
    repository.path,
    'getRemoteURL',
    {
      successExitCodes: new Set([0, 2]),
      expectedErrors: new Set([GitError.NotAGitRepository]),
    }
  )

  if (result.exitCode !== 0) {
    return null
  }

  return result.stdout.slice(0, -1)
}

/**
 * Update the HEAD ref of the remote, which is the default branch.
 *
 * @param isBackgroundTask Whether the fetch is being performed as a
 *                         background task as opposed to being user initiated
 */
export async function updateRemoteHEAD(
  repository: Repository,
  remote: IRemote,
  isBackgroundTask: boolean
): Promise<void> {
  const options = {
    successExitCodes: new Set([0, 1, 128]),
    env: await envForRemoteOperation(remote.url),
    isBackgroundTask,
  }

  await git(
    ['remote', 'set-head', '-a', '--', remote.name],
    repository.path,
    'updateRemoteHEAD',
    options
  )
}

export async function getRemoteHEAD(
  repository: Repository,
  remote: string
): Promise<string | null> {
  const remoteNamespace = `refs/remotes/${remote}/`
  const match = await getSymbolicRef(repository, `${remoteNamespace}HEAD`)
  if (
    match != null &&
    match.length > remoteNamespace.length &&
    match.startsWith(remoteNamespace)
  ) {
    // strip out everything related to the remote because this
    // is likely to be a tracked branch locally
    // e.g. `main`, `develop`, etc
    return match.substring(remoteNamespace.length)
  }

  return null
}
