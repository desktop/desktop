import { git } from './core'
import { Repository } from '../../models/repository'

/** Get the remote names. */
export async function getRemotes(repository: Repository): Promise<ReadonlyArray<string>> {
  const result = await git([ 'remote' ], repository.path)
  const lines = result.stdout
  return lines.split('\n')
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
