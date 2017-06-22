import { git } from './core'
import { Repository } from '../../models/repository'

export async function revertCommit(repository: Repository, SHA: string) {
  await git([ 'revert', '-m', '1', SHA ], repository.path, 'revert')
}
