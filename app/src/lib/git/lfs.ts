import { git } from './core'
import { Repository } from '../../models/repository'

/** Install the global LFS filters. */
export async function installGlobalLFSFilters(force: boolean): Promise<void> {
  const args = ['lfs', 'install', '--skip-repo']
  if (force) {
    args.push('--force')
  }

  await git(args, __dirname, 'installGlobalLFSFilter')
}

/** Install LFS hooks in the repository. */
export async function installLFSHooks(
  repository: Repository,
  force: boolean
): Promise<void> {
  const args = ['lfs', 'install']
  if (force) {
    args.push('--force')
  }

  await git(args, repository.path, 'installLFSHooks')
}

function getLfsTrackOutput(repository: Repository) {
  const env = {
    GIT_LFS_TRACK_NO_INSTALL_HOOKS: '1',
  }
  return git(['lfs', 'track'], repository.path, 'isUsingLFS', {
    env,
  })
}

/** Is the repository configured to track any paths with LFS? */
export async function isUsingLFS(repository: Repository): Promise<boolean> {
  const result = await getLfsTrackOutput(repository)
  return result.stdout.length > 0
}

export async function getLFSPaths(
  repository: Repository
): Promise<ReadonlyArray<string>> {
  const { stdout } = await getLfsTrackOutput(repository)
  const trackExpressionRegex = /\s*(.*)\s\(.*\)\n/g

  const matches = new Array<string>()
  let match = trackExpressionRegex.exec(stdout)

  while (match !== null && match.length === 2) {
    const expression = match[1]
    matches.push(expression)
    match = trackExpressionRegex.exec(stdout)
  }
  return matches
}
