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
const stashEntryMessageRe = /^!!GitHub_Desktop<(.+)@([0-9|a-z|A-Z]{5,40})>$/

/**
 * Get the list of stash entries using the default ordering
 * of `git stash list` i.e., stack orderings.
 *
 * @param repository
 */
export async function getDesktopStashEntries(
  repository: Repository
): Promise<ReadonlyArray<IStashEntry>> {
  const prettyFormat = '%H:%gs'
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

export async function getLastStashEntry(
  repository: Repository,
  branchName: string
) {
  const entries = await getDesktopStashEntries(repository)

  return entries.find(stash => stash.branchName === branchName) || null
}

export function createStashMessage(branchName: string, tipSha: string) {
  return `!!GitHub_Desktop<${branchName}@${tipSha}>`
}

/**
 * Stashes the changes in the working directory
 */
export async function createStashEntry(
  repository: Repository,
  branchName: string,
  tipSha: string
) {
  const message = createStashMessage(branchName, tipSha)
  await git(
    ['stash', 'push', '-m', message],
    repository.path,
    'createStashEntry'
  )
}

function extractBranchFromMessage(message: string): string | null {
  const match = stashEntryMessageRe.exec(message)
  if (match === null) {
    return null
  }

  const branchName = match[1]
  return branchName.length > 0 ? branchName : null
}
