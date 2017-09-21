import { git } from './core'
import { Repository } from '../../models/repository'

/** Open the merge tool for the given file. */
export async function openMergeTool(
  repository: Repository,
  path: string
): Promise<void> {
  await git(['mergetool', path], repository.path, 'openMergeTool')
}
