import { git } from './core'
import { Repository } from '../../models/repository'
import { IRemote } from '../../models/remote'

/** Get the remote names. */
export async function getRemotes(repository: Repository): Promise<ReadonlyArray<string>> {
  const result = await git([ 'remote' ], repository.path, 'getRemotes')
  const lines = result.stdout
  return lines.split('\n')
}

/** Get the name of the default remote. */
export async function getDefaultRemote(repository: Repository): Promise<IRemote | null> {
  const remotes = await getRemotes(repository)
  if (remotes.length === 0) {
    return null
  }

  const index = remotes.indexOf('origin')
  let name: string | null = null
  if (index > -1) {
    name = remotes[index]
  } else {
    name = remotes[0]
  }

  return name ? { name, url: '' } : null
}

/** Add a new remote with the given URL. */
export async function addRemote(path: string, name: string, url: string): Promise<void> {
  await git([ 'remote', 'add', name, url ], path, 'addRemote')
}
