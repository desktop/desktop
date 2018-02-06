import { git } from './core'
import { Repository } from '../../models/repository'

/** Merge the named branch into the current branch. */
export async function merge(
  repository: Repository,
  branch: string
): Promise<void> {
  await git(['merge', branch], repository.path, 'merge')
}

export async function getMergeBase(
  repository: Repository,
  firstRef: string,
  secondRef: string
): Promise<string> {
  const process = await git(
    ['merge-base', firstRef, secondRef],
    repository.path,
    'merge-base'
  )
  return process.stdout.trim()
}
