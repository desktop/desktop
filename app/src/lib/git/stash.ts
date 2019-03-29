import { git } from '.'
import { Repository } from '../../models/repository'
import { GitError, IGitResult } from './core'

export const DesktopStashEntryMarker = '!!GitHub_Desktop'

export interface IStashEntry {
  /** The name of the branch at the time the entry was created. */
  readonly branchName: string

  /** The SHA of the commit object created as a result of stashing. */
  readonly stashSha: string
}

/** RegEx for parsing out the stash SHA and message */
const stashEntryRe = /^([0-9a-f]{40})@(.+)$/

/**
 * RegEx for determining if a stash entry is created by Desktop
 *
 * This is done by looking for a magic string with the following
 * format: `!!GitHub_Desktop<branch@commit>`
 */
const desktopStashEntryMessageRe = /^!!GitHub_Desktop<(.+)@([0-9|a-z|A-Z]{40})>$/

/**
 * Get the list of stash entries created by Desktop in the current repository
 * using the default ordering of `git stash list` (i.e., LIFO ordering).
 */
export async function getDesktopStashEntries(
  repository: Repository
): Promise<ReadonlyArray<IStashEntry>> {
  const expectedErrorMessages = ["fatal: ambiguous argument 'refs/stash'"]
  const prettyFormat = '%H@%gs'
  let result: IGitResult | null = null

  try {
    result = await git(
      ['log', '-g', 'refs/stash', `--pretty=${prettyFormat}`],
      repository.path,
      'getStashEntries'
    )
  } catch (err) {
    if (err instanceof GitError) {
      if (
        !expectedErrorMessages.some(
          message => err.message.indexOf(message) !== -1
        )
      ) {
        // if the error is not expected, re-throw it so the caller can deal with it
        throw err
      }
    }
  }

  if (result === null) {
    // a git error that Desktop doesn't care about occured, so return empty list
    return []
  }

  const lines = result.stdout.split('\n')
  const stashEntries: Array<IStashEntry> = []
  for (const line of lines) {
    const match = stashEntryRe.exec(line)
    if (match == null) {
      continue
    }

    const message = match[2]
    const branchName = extractBranchFromMessage(message)

    // if branch name is null, the stash entry isn't using our magic string
    if (branchName === null) {
      // the stash entry isn't using our magic string, so skip it
      continue
    }

    stashEntries.push({
      branchName: branchName,
      stashSha: match[1],
    })
  }

  return stashEntries
}

/**
 * Returns the last Desktop created stash entry for the given branch
 */
export async function getLastDesktopStashEntryForBranch(
  repository: Repository,
  branchName: string
) {
  const entries = await getDesktopStashEntries(repository)

  // Since stash objects are returned in a LIFO manner, the first
  // entry found is guaranteed to be the last entry created
  return entries.find(stash => stash.branchName === branchName) || null
}

/** Creates a stash entry message that idicates the entry was created by Desktop */
export function createDesktopStashMessage(branchName: string, tipSha: string) {
  return `${DesktopStashEntryMarker}<${branchName}@${tipSha}>`
}

/**
 * Stash the working directory changes for the current branch
 */
export async function createDesktopStashEntry(
  repository: Repository,
  branchName: string,
  tipSha: string
) {
  const message = createDesktopStashMessage(branchName, tipSha)
  const result = await git(
    ['stash', 'push', '-m', message],
    repository.path,
    'createStashEntry'
  )

  if (result.stderr !== '') {
    throw new Error(result.stderr)
  }
}

/**
 * Removes the stash entry identified by `stashSha`
 */
export async function dropDesktopStashEntry(
  repository: Repository,
  stashSha: string
) {
  if (stashSha === '') {
    // the drop sub-command behaves like pop when no stash is given
    // so we return if given an empty string to avoid that
    return
  }

  const entry = ['stash@{', stashSha, '}'].join('')
  const result = await git(
    ['stash', 'drop', entry],
    repository.path,
    'dropStashEntry'
  )

  if (result.stderr !== '') {
    throw new Error(result.stderr)
  }
}

/**
 * Applies the stash entry identified by matching `stashSha` to its commit hash.
 *
 * To see the commit hash of stash entry, run
 * `git log -g refs/stash --pretty="%nentry: %gd%nsubject: %gs%nhash: %H%n"`
 * in a repo with some stash entries.
 */
export async function applyStashEntry(
  repository: Repository,
  stashSha: string
): Promise<void> {
  await git(
    ['stash', 'apply', `${stashSha}`],
    repository.path,
    'applyStashEntry'
  )
}

function extractBranchFromMessage(message: string): string | null {
  const match = desktopStashEntryMessageRe.exec(message)
  if (match === null) {
    return null
  }

  const branchName = match[1]
  return branchName.length > 0 ? branchName : null
}
