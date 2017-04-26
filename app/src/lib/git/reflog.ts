import { git } from './core'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'

/** Get the `limit` most recently checked out branches. */
export async function getRecentBranches(repository: Repository, branches: ReadonlyArray<Branch>, limit: number): Promise<ReadonlyArray<Branch>> {
  const branchesByName = branches.reduce((map, branch) => map.set(branch.name, branch), new Map<string, Branch>())

  // "git reflog show" is just an alias for "git log -g --abbrev-commit --pretty=oneline"
  // but by using log we can give it a max number which should prevent us from balling out
  // of control when there's ginormous reflogs around (as in e.g. github/github).
  const regex = new RegExp(/.*? checkout: moving from .*? to (.*?)$/i)
  const result = await git([ 'log', '-g', '--no-abbrev-commit', '--pretty=oneline', 'HEAD', '-n', '2500', '--' ], repository.path, 'getRecentBranches', { successExitCodes: new Set([ 0, 128 ]) })

  if (result.exitCode === 128) {
    // error code 128 is returned if the branch is unborn
    return new Array<Branch>()
  }

  const output = result.stdout
  const lines = output.split('\n')
  const names = new Set<string>()
  for (const line of lines) {
    const result = regex.exec(line)
    if (result && result.length === 2) {
      const branchName = result[1]
      names.add(branchName)
    }

    if (names.size === limit) {
      break
    }
  }

  const recentBranches = new Array<Branch>()
  for (const name of names) {
    const branch = branchesByName.get(name)
    if (!branch) {
      // This means the recent branch has been deleted. That's fine.
      continue
    }

    recentBranches.push(branch)
  }

  return recentBranches
}
