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
  // Config queries also work outside repositories, where they can still return
  // global remotes. Preserve the empty result for non-repository directories.
  const result = await git(
    ['rev-parse', '--git-dir'],
    repository.path,
    'getRemotes',
    { expectedErrors: new Set([GitError.NotAGitRepository]) }
  )

  if (result.gitError === GitError.NotAGitRepository) {
    return []
  }

  // Unlike `remote -v`, this format keeps tabs and line separators in URLs
  // separate from remote names. Don't restrict the query to --local: included
  // and globally configured remotes should remain visible.
  const config = await git(
    ['config', '--null', '--get-regexp', '^remote\\..+\\.url$'],
    repository.path,
    'getRemotes',
    {
      // Git returns 1 when no URL keys match, including in a new repository.
      successExitCodes: new Set([0, 1]),
    }
  )

  const names = new Set<string>()
  // Output is key<LF>value<NUL>. The trailing NUL creates an empty split element.
  // Only the first LF separates the key and value; later LFs belong to the URL.
  for (const entry of config.stdout.split('\0').slice(0, -1)) {
    const separator = entry.indexOf('\n')
    // A valueless setting has no LF, unlike an explicitly empty URL value.
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
    // Let Git select the first fetch URL and apply insteadOf rewrites rather
    // than returning raw config values or implementing those rules ourselves.
    // Unlike remote get-url, this also resolves globally configured remotes.
    // --get-url does not contact the remote.
    // Match `remote -v` enumeration even when a URL contains credentials.
    // Override the transfer policy only for this offline lookup, not transfers.
    const { stdout } = await git(
      [
        '-c',
        'transfer.credentialsInUrl=allow',
        'ls-remote',
        '--get-url',
        '--',
        name,
      ],
      repository.path,
      'getRemotes'
    )
    // Remove only Git's final LF; trimEnd() would also remove URL whitespace.
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
      // 2 means a missing remote; 128 can also mean malformed configuration.
      successExitCodes: new Set([0, 2]),
      expectedErrors: new Set([GitError.NotAGitRepository]),
    }
  )

  if (result.exitCode !== 0) {
    return null
  }

  // The URL itself may end in LF, so strip exactly one output terminator.
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
