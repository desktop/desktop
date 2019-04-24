import { git } from '.'
import { Repository } from '../../models/repository'
import { GitError as DugiteError } from 'dugite'
import {
  IStashEntry,
  StashedChangesLoadStates,
  StashedFileChanges,
} from '../../models/stash-entry'
import { CommittedFileChange } from '../../models/status'
import { parseChangedFiles } from './log'

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
 */
export async function createDesktopStashEntry(
  repository: Repository,
  branchName: string
) {
  const message = createDesktopStashMessage(branchName)
  const args = ['stash', 'push', '--include-untracked', '-m', message]
  await git(args, repository.path, 'createStashEntry')
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
  const stashToPop = await getStashEntryMatchingSha(repository, stashSha)

  if (stashToPop !== null) {
    const args = ['stash', 'pop', `${stashToPop.name}`]
    await git(args, repository.path, 'popStashEntry', { expectedErrors })
  }
}

function extractBranchFromMessage(message: string): string | null {
  const match = desktopStashEntryMessageRe.exec(message)
  return match === null || match[1].length === 0 ? null : match[1]
}

/**
 * Get the files that were changed in the given stash commit.
 *
 * This is different than `getChangedFiles` because stashes
 * have _3 parents(!!!)_
 */
export async function getStashedFiles(
  repository: Repository,
  stashSha: string
): Promise<ReadonlyArray<CommittedFileChange>> {
  const [trackedFiles, untrackedFiles] = await Promise.all([
    getChangedFilesWithinStash(repository, stashSha),
    getChangedFilesWithinStash(repository, `${stashSha}^3`),
  ])

  const files = new Map<string, CommittedFileChange>()
  trackedFiles.forEach(x => files.set(x.path, x))
  untrackedFiles.forEach(x => files.set(x.path, x))
  return [...files.values()].sort((x, y) => x.path.localeCompare(y.path))
}

/**
 * Same thing as `getChangedFiles` but with extra handling for 128 exit code
 * (which happens if the commit's parent is not valid)
 *
 * **TODO:** merge this with `getChangedFiles` in `log.ts`
 */
async function getChangedFilesWithinStash(repository: Repository, sha: string) {
  // opt-in for rename detection (-M) and copies detection (-C)
  // this is equivalent to the user configuring 'diff.renames' to 'copies'
  // NOTE: order here matters - doing -M before -C means copies aren't detected
  const args = [
    'log',
    sha,
    '-C',
    '-M',
    '-m',
    '-1',
    '--no-show-signature',
    '--first-parent',
    '--name-status',
    '--format=format:',
    '-z',
    '--',
  ]
  const result = await git(args, repository.path, 'getChangedFilesForStash', {
    // if this fails, its most likely
    // because there weren't any untracked files,
    // and that's okay!
    successExitCodes: new Set([0, 128]),
  })
  if (result.exitCode === 0 && result.stdout.length > 0) {
    return parseChangedFiles(result.stdout, sha)
  }
  return []
}
