import { git } from './core'
import { Repository } from '../../models/repository'

/** Get the `limit` most recently checked out branches. */
export async function getRecentBranches(
  repository: Repository,
  limit: number
): Promise<ReadonlyArray<string>> {
  // "git reflog show" is just an alias for "git log -g --abbrev-commit --pretty=oneline"
  // but by using log we can give it a max number which should prevent us from balling out
  // of control when there's ginormous reflogs around (as in e.g. github/github).
  const regex = new RegExp(
    /.*? (renamed|checkout)(?:: moving from|\s*) (?:refs\/heads\/|\s*)(.*?) to (?:refs\/heads\/|\s*)(.*?)$/i
  )

  const result = await git(
    [
      'log',
      '-g',
      '--no-abbrev-commit',
      '--pretty=oneline',
      'HEAD',
      '-n',
      '2500',
      '--',
    ],
    repository.path,
    'getRecentBranches',
    { successExitCodes: new Set([0, 128]) }
  )

  if (result.exitCode === 128) {
    // error code 128 is returned if the branch is unborn
    return []
  }

  const lines = result.stdout.split('\n')
  const names = new Set<string>()
  // exclude master from recent branches
  const excludedNames = new Set<String>(['master'])

  for (const line of lines) {
    const result = regex.exec(line)
    if (result && result.length === 4) {
      const operationType = result[1]
      const excludeBranchName = result[2]
      const branchName = result[3]

      if (operationType === 'renamed') {
        // exclude intermediate-state renaming branch from recent branches
        excludedNames.add(excludeBranchName)
      }

      if (!excludedNames.has(branchName)) {
        names.add(branchName)
      }
    }

    if (names.size === limit) {
      break
    }
  }

  return [...names]
}
