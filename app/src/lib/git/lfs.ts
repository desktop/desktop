import { git } from './core'
import { Repository } from '../../models/repository'

/** Install the global LFS filters. */
export async function installGlobalLFSFilters(): Promise<void> {
  await git(
    ['lfs', 'install', '--skip-repo'],
    __dirname,
    'installGlobalLFSFilter'
  )
}

/** Is the repository configured to track any paths with LFS? */
export async function isUsingLFS(repository: Repository): Promise<boolean> {
  const result = await git(['lfs', 'track'], repository.path, 'isUsingLFS')
  return result.stdout.length > 0
}
