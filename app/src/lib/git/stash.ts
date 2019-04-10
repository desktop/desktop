import { git } from '.'
import { Repository } from '../../models/repository'
import { GitError, IGitResult } from './core'
import { GitError as DugiteError } from 'dugite'
import { IStashEntry } from '../../models/stash-entry'

export const DesktopStashEntryMarker = '!!GitHub_Desktop'

/** RegEx for parsing out the stash SHA and message */
const stashEntryRe = /^([0-9a-f]{40})@(.+)$/

/**
 * RegEx for determining if a stash entry is created by Desktop
 *
 * This is done by looking for a magic string with the following
 * format: `!!GitHub_Desktop<branch@commit>`
 */
const desktopStashEntryMessageRe = /!!GitHub_Desktop<(.+)@([0-9|a-z|A-Z]{40})>$/

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
      ['log', '-g', `--pretty=${prettyFormat}`, 'refs/stash'],
      repository.path,
      'getStashEntries'
    )
  } catch (err) {
    if (err instanceof GitError) {
      const shouldThrow = !expectedErrorMessages.some(
        message => err.message.indexOf(message) !== -1
      )
      if (shouldThrow) {
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
  let ix = -1
  for (const line of lines) {
    // need to get name from stash list
    ix++

    const match = stashEntryRe.exec(line)
    if (match == null) {
      continue
    }

    const message = match[2]
    const branchName = extractBranchFromMessage(message)

    if (branchName === null) {
      // the stash entry isn't using our magic string, so skip it
      continue
    }

    stashEntries.push({
      name: `stash@{${ix}}`,
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
 *
 * @param tipSha is only used to format the message.
 */
export async function createDesktopStashEntry(
  repository: Repository,
  branchName: string,
  tipSha: string
) {
  const message = createDesktopStashMessage(branchName, tipSha)
  await git(
    ['stash', 'push', '--include-untracked', '-m', message],
    repository.path,
    'createStashEntry'
  )
}

/**
 * Removes the given stash entry if it exists
 *
 * @param stashSha the SHA that identifies the stash entry
 */
export async function dropDesktopStashEntry(
  repository: Repository,
  stashSha: string
) {
  // get the latest name for the stash entry since it may have changed
  const stashEntries = await getDesktopStashEntries(repository)

  if (stashEntries.length === 0) {
    return
  }

  const entryToDelete = stashEntries.find(e => e.stashSha === stashSha)
  if (entryToDelete === undefined) {
    return
  }

  await git(
    ['stash', 'drop', entryToDelete.name],
    repository.path,
    'dropStashEntry'
  )
}

/**
 * Pops the stash entry identified by matching `stashSha` to its commit hash.
 *
 * To see the commit hash of stash entry, run
 * `git log -g refs/stash --pretty="%nentry: %gd%nsubject: %gs%nhash: %H%n"`
 * in a repo with some stash entries.
 */
export async function popStashEntry(
  repository: Repository,
  stashSha: string
): Promise<void> {
  // ignoring these git errors for now, this will change when we start
  // implementing the stash conflict flow
  const expectedErrors = new Set<DugiteError>([DugiteError.MergeConflicts])
  // get the latest name for the stash entry since it may have changed
  const stashEntries = await getDesktopStashEntries(repository)

  if (stashEntries.length === 0) {
    return
  }

  const stashToPop = stashEntries.find(e => e.stashSha === stashSha)
  if (stashToPop === undefined) {
    return
  }

  try {
    await git(
      ['stash', 'pop', `${stashToPop.name}`],
      repository.path,
      'popStashEntry',
      {
        expectedErrors,
      }
    )
  } catch (err) {
    if (err instanceof GitError) {
      log.error(err.message)
    }
  }
}

function extractBranchFromMessage(message: string): string | null {
  const match = desktopStashEntryMessageRe.exec(message)
  if (match === null) {
    return null
  }

  const branchName = match[1]
  return branchName.length > 0 ? branchName : null
}
