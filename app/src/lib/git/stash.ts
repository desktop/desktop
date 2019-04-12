import { git } from '.'
import { Repository } from '../../models/repository'
import { GitError as DugiteError } from 'dugite'
import {
  IStashEntry,
  StashedChangesLoadStates,
  StashedFileChanges,
} from '../../models/stash-entry'

export const DesktopStashEntryMarker = '!!GitHub_Desktop'

/**
 * RegEx for determining if a stash entry is created by Desktop
 *
 * This is done by looking for a magic string with the following
 * format: `!!GitHub_Desktop<branch>`
 */
const desktopStashEntryMessageRe = /!!GitHub_Desktop<(.+)>$/

/**
 * Get the list of stash entries created by Desktop in the current repository
 * using the default ordering of `git stash list` (i.e., LIFO ordering).
 */
export async function getDesktopStashEntries(
  repository: Repository
): Promise<ReadonlyArray<IStashEntry>> {
  const delimiter = '1F'
  const delimiterString = String.fromCharCode(parseInt(delimiter, 16))
  const format = ['%gd', '%H', '%gs'].join(`%x${delimiter}`)

  const result = await git(
    ['log', '-g', '-z', `--pretty=${format}`, 'refs/stash'],
    repository.path,
    'getStashEntries',
    {
      successExitCodes: new Set([0, 128]),
    }
  )

  // There's no refs/stashes reflog in the repository or it's not
  // even a repository. In either case we don't care
  if (result.exitCode === 128) {
    return []
  }

  const stashEntries: Array<IStashEntry> = []
  const files: StashedFileChanges = { kind: StashedChangesLoadStates.NotLoaded }

  for (const line of result.stdout.split('\0')) {
    const pieces = line.split(delimiterString)

    if (pieces.length === 3) {
      const [name, stashSha, message] = pieces
      const branchName = extractBranchFromMessage(message)

      if (branchName !== null) {
        stashEntries.push({ name, branchName, stashSha, files })
      }
    }
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
export function createDesktopStashMessage(branchName: string) {
  return `${DesktopStashEntryMarker}<${branchName}>`
}

/**
 * Stash the working directory changes for the current branch
 *
 * @param tipSha is only used to format the message.
 */
export async function createDesktopStashEntry(
  repository: Repository,
  branchName: string
) {
  const message = createDesktopStashMessage(branchName)
  await git(
    ['stash', 'push', '--include-untracked', '-m', message],
    repository.path,
    'createStashEntry'
  )
}

async function getStashEntryMatchingSha(repository: Repository, sha: string) {
  const stashEntries = await getDesktopStashEntries(repository)
  return stashEntries.find(e => e.stashSha === sha) || null
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
  const entryToDelete = await getStashEntryMatchingSha(repository, stashSha)

  if (entryToDelete !== null) {
    const args = ['stash', 'drop', entryToDelete.name]
    await git(args, repository.path, 'dropStashEntry')
  }
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

  await git(
    ['stash', 'pop', `${stashToPop.name}`],
    repository.path,
    'popStashEntry',
    {
      expectedErrors,
    }
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
