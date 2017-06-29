import { git } from './core'
import { Repository } from '../../models/repository'
import { IRemote } from '../../models/remote'

/** Get the remote names. */
export async function getRemotes(
  repository: Repository
): Promise<ReadonlyArray<IRemote>> {
  const result = await git(['remote', '-v'], repository.path, 'getRemotes')
  const output = result.stdout
  const lines = output.split('\n')
  const remotes = lines
    .filter(x => x.endsWith('(fetch)'))
    .map(x => x.split(/\s+/))
    .map(x => ({ name: x[0], url: x[1] }))

  return remotes
}

/** Get the name of the default remote. */
export async function getDefaultRemote(
  repository: Repository
): Promise<IRemote | null> {
  const remotes = await getRemotes(repository)
  if (remotes.length === 0) {
    return null
  }

  const remote = remotes.find(x => x.name === 'origin')

  if (remote) {
    return remote
  }

  return remotes[0]
}

/** Add a new remote with the given URL. */
export async function addRemote(
  repository: Repository,
  name: string,
  url: string
): Promise<void> {
  await git(['remote', 'add', name, url], repository.path, 'addRemote')
}

/** Removes an existing remote, or silently errors if it doesn't exist */
export async function removeRemote(
  repository: Repository,
  name: string
): Promise<void> {
  const options = {
    successExitCodes: new Set([0, 128]),
  }

  await git(
    ['remote', 'remove', name],
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
): Promise<void> {
  await git(['remote', 'set-url', name, url], repository.path, 'setRemoteURL')
}
