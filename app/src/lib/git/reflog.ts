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

/**
 * Gets the distinct list of branches that have been checked out after a specific date
 * Returns a map keyed on branch names
 *
 * @param repository the repository who's reflog you want to check
 * @param afterDate filters checkouts so that only those occuring on or after this date are returned
 * @returns map of branch name -> checkout date
 */
export async function getBranchCheckouts(
  repository: Repository,
  afterDate: Date
): Promise<Map<string, Date>> {
  //regexr.com/46n1v
  const regex = new RegExp(
    /^[a-z0-9]{40}\sHEAD@{(.*)}\scheckout: moving from\s.*\sto\s(.*)$/
  )
  const gitOutput = await git(
    [
      'reflog',
      '--date=iso',
      `--after="${afterDate.toISOString()}"`,
      '--pretty=%H %gd %gs',
      `--grep-reflog=checkout: moving from .* to .*$`,
      '--',
    ],
    repository.path,
    'getCheckoutsAfterDate'
  )
  const checkouts = new Map<string, Date>()
  const lines = gitOutput.stdout.split('\n')
  for (const line of lines) {
    const parsedLine = regex.exec(line)

    if (parsedLine === null || parsedLine.length !== 3) {
      continue
    }

    const [, timestamp, branchName] = parsedLine
    if (!checkouts.has(branchName)) {
      checkouts.set(branchName, new Date(timestamp))
    }
  }

  return checkouts
}
