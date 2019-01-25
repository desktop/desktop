import { getCommit } from '../../src/lib/git'
import { Commit } from '../../src/models/commit'
import { Repository } from '../../src/models/repository'

export async function getTipOrError(repository: Repository): Promise<Commit> {
  const commit = await getCommit(repository, 'HEAD')

  if (commit === null) {
    throw new Error(
      'Unable to find commit for HEAD - is this an unborn repository?'
    )
  }

  return commit
}
