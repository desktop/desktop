import { git } from './core'
import { Repository } from '../../models/repository'

/** Get the remote names. */
export async function getRemotes(repository: Repository): Promise<ReadonlyArray<string>> {
  const result = await git([ 'remote' ], repository.path, 'getRemotes')
  const lines = result.stdout
  const rows = lines.split('\n')
  return rows.filter(r => r.trim().length > 0)
}

/** Get the name of the default remote. */
export async function getDefaultRemote(repository: Repository): Promise<string | null> {
  const remotes = await getRemotes(repository)
  if (remotes.length === 0) {
    return null
  }

  const index = remotes.indexOf('origin')
  if (index > -1) {
    return remotes[index]
  } else {
    return remotes[0]
  }
}

/** Add a new remote with the given URL. */
export async function addRemote(repository: Repository, name: string, url: string): Promise<void> {
  await git([ 'remote', 'add', name, url ], repository.path, 'addRemote')
}

/** Removes an existing remote, or silently errors if it doesn't exist */
export async function removeRemote(repository: Repository, name: string): Promise<void> {
  const options = {
   successExitCodes: new Set([ 0, 128 ]),
  }

  await git([ 'remote', 'remove', name ], repository.path, 'removeRemote', options)
}
