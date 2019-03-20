import { git } from '.'
import { Repository } from '../../models/repository'

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
const stashEntryMessageRe = /^!!GitHub_Desktop<(.+)@([0-9|a-z|A-Z]{40})>$/

/**
 * Get the list of stash entries created by Desktop in the current repository
 * using the default ordering of `git stash list` (i.e., LIFO ordering).
 */
export async function getDesktopStashEntries(
  repository: Repository
): Promise<ReadonlyArray<IStashEntry>> {
  const prettyFormat = '%H@%gs'
  const result = await git(
    ['log', '-g', 'refs/stash', `--pretty=${prettyFormat}`],
    repository.path,
    'getStashEntries'
  )

  if (result.stderr !== '') {
    //don't really care what the error is right now, but will once dugite is updated
    throw new Error(result.stderr)
  }

  const out = result.stdout
  const lines = out.split('\n')

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

function extractBranchFromMessage(message: string): string | null {
  const match = stashEntryMessageRe.exec(message)
  if (match === null) {
    return null
  }

  const branchName = match[1]
  return branchName.length > 0 ? branchName : null
}
