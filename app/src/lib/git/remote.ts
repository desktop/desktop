import { git } from './core'
import { Repository } from '../../models/repository'
import { IRemote } from '../../models/remote'

/** Get the remote names. */
export async function getRemotes(repository: Repository): Promise<ReadonlyArray<IRemote>> {
  const result = await git([ 'remote', '-v' ], repository.path, 'getRemotes')
  const output = result.stdout
  const lines = output.split('\n')
  const remotes = lines
    .map(x  => x.split(/\s+/))
    .map(x => ({ name: x[0], url: x[1] }))
    .filter((x, i) => i % 2 !== 0)

  return remotes
}

/** Get the name of the default remote. */
export async function getDefaultRemote(repository: Repository): Promise<IRemote | null> {
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
export async function addRemote(path: string, name: string, url: string): Promise<void> {
  await git([ 'remote', 'add', name, url ], path, 'addRemote')
}

/** Changes the URl for the remote that matches the given name  */
export async function setRemoteURL(repository: Repository, name: string, url: string): Promise<void> {
  await git([ 'remote', 'set-url', name, url ], repository.path, 'setRemoteURL')
}
