import { git } from './core'

/** Install the global LFS filters. */
export function installGlobalLFSFilters() {
  return git(
    ['lfs', 'install', '--skip-repo'],
    __dirname,
    'installGlobalLFSFilter'
  )
}
