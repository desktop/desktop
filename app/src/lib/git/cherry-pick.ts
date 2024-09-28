import * as Path from 'path'
import { GitError } from 'dugite'
import { Repository } from '../../models/repository'
import {
  AppFileStatusKind,
  WorkingDirectoryFileChange,
} from '../../models/status'
import { git, IGitExecutionOptions, IGitResult } from './core'
import { getStatus } from './status'
import { stageFiles } from './update-index'
import { getCommitsInRange, revRange } from './rev-list'
import { CommitOneLine } from '../../models/commit'
import { merge } from '../merge'
import { ChildProcess } from 'child_process'
import { round } from '../../ui/lib/round'
import byline from 'byline'
import { ICherryPickSnapshot } from '../../models/cherry-pick'
import { ManualConflictResolution } from '../../models/manual-conflict-resolution'
import { stageManualConflictResolution } from './stage'
import { getCommit } from '.'
import { IMultiCommitOperationProgress } from '../../models/progress'
import { readFile } from 'fs/promises'
import { pathExists } from '../../ui/lib/path-exists'

/** The app-specific results from attempting to cherry pick commits*/
export enum CherryPickResult {
  /**
   * Git completed the cherry pick without reporting any errors, and the caller can
   * signal success to the user.
   */
  CompletedWithoutError = 'CompletedWithoutError',
  /**
   * The cherry pick encountered conflicts while attempting to cherry pick and
   * need to be resolved before the user can continue.
   */
  ConflictsEncountered = 'ConflictsEncountered',
  /**
   * The cherry pick was not able to continue as tracked files were not staged in
   * the index.
   */
  OutstandingFilesNotStaged = 'OutstandingFilesNotStaged',
  /**
   * The cherry pick was not attempted:
   * - it could not check the status of the repository.
   * - there was an invalid revision range provided.
   * - there were uncommitted changes present.
   * - there were errors in checkout the target branch
   */
  UnableToStart = 'UnableToStart',
  /**
   * An unexpected error as part of the cherry pick flow was caught and handled.
   *
   * Check the logs to find the relevant Git details.
   */
  Error = 'Error',
}

/**
 * A parser to read and emit cherry pick progress from Git `stdout`.
 *
 * Each successful cherry picked commit outputs a set of lines similar to the
 * following example:
 *    [branchName commitSha] commitSummary
 *      Date: timestamp
 *      1 file changed, 1 insertion(+)
 *      create mode 100644 filename
 */
class GitCherryPickParser {
  public constructor(
    private readonly commits: ReadonlyArray<CommitOneLine>,
    private count: number = 0
  ) {}

  public parse(line: string): IMultiCommitOperationProgress | null {
    const cherryPickRe = /^\[(.*\s.*)\]/
    const match = cherryPickRe.exec(line)
    if (match === null) {
      // Skip lines that don't represent the first line of a successfully picked
      // commit. -- i.e. timestamp, files changed, conflicts, etc..
      return null
    }
    this.count++

    return {
      kind: 'multiCommitOperation',
      value: round(this.count / this.commits.length, 2),
      position: this.count,
      totalCommitCount: this.commits.length,
      currentCommitSummary: this.commits[this.count - 1]?.summary ?? '',
    }
  }
}

/**
 * This method merges `baseOptions` with a call back method that obtains a
 * `ICherryPickProgress` instance from `stdout` parsing.
 *
 * @param baseOptions - contains git execution options other than the
 * progressCallBack such as expectedErrors
 * @param commits - used by the parser to form `ICherryPickProgress` instance
 * @param progressCallback - the callback method that accepts an
 * `ICherryPickProgress` instance created by the parser
 */
function configureOptionsWithCallBack(
  baseOptions: IGitExecutionOptions,
  commits: readonly CommitOneLine[],
  progressCallback: (progress: IMultiCommitOperationProgress) => void,
  cherryPickedCount: number = 0
) {
  return merge(baseOptions, {
    processCallback: (process: ChildProcess) => {
      if (process.stdout === null) {
        return
      }
      const parser = new GitCherryPickParser(commits, cherryPickedCount)

      byline(process.stdout).on('data', (line: string) => {
        const progress = parser.parse(line)

        if (progress != null) {
          progressCallback(progress)
        }
      })
    },
  })
}

/**
 * A function to initiate cherry picking in the app.
 *
 * @param commits - array of commits to cherry-pick
 * For a cherry-pick operation, it does not matter what order the commits
 * appear. But, it is best practice to send them in ascending order to prevent
 * conflicts. First one on the array is first to be cherry-picked.
 */
export async function cherryPick(
  repository: Repository,
  commits: ReadonlyArray<CommitOneLine>,
  progressCallback?: (progress: IMultiCommitOperationProgress) => void
): Promise<CherryPickResult> {
  if (commits.length === 0) {
    return CherryPickResult.UnableToStart
  }

  let baseOptions: IGitExecutionOptions = {
    expectedErrors: new Set([
      GitError.MergeConflicts,
      GitError.ConflictModifyDeletedInBranch,
    ]),
  }

  if (progressCallback !== undefined) {
    baseOptions = await configureOptionsWithCallBack(
      baseOptions,
      commits,
      progressCallback
    )
  }

  // --empty=keep follows pattern of making sure someone cherry
  //  picked commit summaries appear in target branch history even tho they may
  //  be empty. This flag also results in the ability to cherry pick empty
  //  commits (thus, --allow-empty is not required.)
  //
  // -m 1 makes it so a merge commit always takes the first parent's history
  //  (the branch you are cherry-picking from) for the commit. It also means
  //  there could be multiple empty commits. I.E. If user does a range that
  //  includes commits from that merge.
  const result = await git(
    ['cherry-pick', ...commits.map(c => c.sha), '--empty=keep', '-m 1'],
    repository.path,
    'cherry-pick',
    baseOptions
  )

  return parseCherryPickResult(result)
}

function parseCherryPickResult(result: IGitResult): CherryPickResult {
  if (result.exitCode === 0) {
    return CherryPickResult.CompletedWithoutError
  }

  switch (result.gitError) {
    case GitError.ConflictModifyDeletedInBranch:
    case GitError.MergeConflicts:
      return CherryPickResult.ConflictsEncountered
    case GitError.UnresolvedConflicts:
      return CherryPickResult.OutstandingFilesNotStaged
    default:
      throw new Error(`Unhandled result found: '${JSON.stringify(result)}'`)
  }
}

/**
 * Inspect the `.git/sequencer` folder and convert the current cherry pick
 * state into am `ICherryPickProgress` instance as well as return an array of
 * remaining commits queued for cherry picking.
 *  - Progress instance required to display progress to user.
 *  - Commits required to track progress after a conflict has been resolved.
 *
 * This is required when Desktop is not responsible for initiating the cherry
 * pick and when continuing a cherry pick after conflicts are resolved:
 *
 * It returns null if it cannot parse an ongoing cherry pick. This happens when,
 *  - There isn't a cherry pick in progress (expected null outcome).
 *  - Runs into errors parsing cherry pick files. This is expected if cherry
 *    pick is aborted or finished during parsing. It could also occur if cherry
 *    pick sequencer files are corrupted.
 */
export async function getCherryPickSnapshot(
  repository: Repository
): Promise<ICherryPickSnapshot | null> {
  if (!isCherryPickHeadFound(repository)) {
    // If there no cherry pick head, there is no cherry pick in progress.
    return null
  }

  // Abort safety sha is stored in.git/sequencer/abort-safety. It is the sha of
  // the last cherry-picked commit in the operation or the head of target branch
  // if no commits have been cherry-picked yet.
  let abortSafetySha: string = ''

  // The head sha is stored in .git/sequencer/head. It is the sha of target
  // branch before the cherry-pick operation occurred.
  let headSha: string = ''

  // Each line of .git/sequencer/todo holds a sha of a commit lined up to be
  // cherry-picked. These shas are in historical order starting oldest commit as
  // the first line and newest as the last line.
  const remainingCommits: CommitOneLine[] = []

  // Try block included as files may throw an error if it cannot locate
  // the sequencer files. This is possible if cherry pick is continued
  // or aborted at the same time.
  try {
    abortSafetySha = (
      await readFile(
        Path.join(repository.path, '.git', 'sequencer', 'abort-safety'),
        'utf8'
      )
    ).trim()

    if (abortSafetySha === '') {
      // Technically possible if someone continued or aborted the cherry pick at
      // the same time
      return null
    }

    headSha = (
      await readFile(
        Path.join(repository.path, '.git', 'sequencer', 'head'),
        'utf8'
      )
    ).trim()

    if (headSha === '') {
      // Technically possible if someone continued or aborted the cherry pick at
      // the same time
      return null
    }

    const remainingPicks = (
      await readFile(
        Path.join(repository.path, '.git', 'sequencer', 'todo'),
        'utf8'
      )
    ).trim()

    if (remainingPicks === '') {
      // Technically possible if someone continued or aborted the cherry pick at
      // the same time
      return null
    }

    // Each line is of the format: `pick shortSha commitSummary`
    remainingPicks.split('\n').forEach(line => {
      line = line.replace(/^pick /, '')
      if (line.trim().includes(' ')) {
        const sha = line.substr(0, line.indexOf(' '))
        const commit: CommitOneLine = {
          sha,
          summary: line.substr(sha.length + 1),
        }
        remainingCommits.push(commit)
      }
    })

    if (remainingCommits.length === 0) {
      // This should only be possible with corrupt sequencer files.
      return null
    }
  } catch {
    // could not parse sequencer files

    if (!isCherryPickHeadFound(repository)) {
      // We redo this check just because a user technically could end the
      // cherry-pick by the time we got here.
      return null
    }

    // If cherry-pick is in progress, then there was only one commit cherry-picked
    // thus sequencer files were not used.
    const cherryPickHeadSha = (
      await readFile(
        Path.join(repository.path, '.git', 'CHERRY_PICK_HEAD'),
        'utf8'
      )
    ).trim()
    const commit = await getCommit(repository, cherryPickHeadSha)
    if (commit === null) {
      return null
    }

    return {
      progress: {
        kind: 'multiCommitOperation',
        value: 1,
        position: 1,
        totalCommitCount: 1,
        currentCommitSummary: commit.summary,
      },
      remainingCommits: [],
      commits: [{ sha: commit.sha, summary: commit.summary }],
      targetBranchUndoSha: headSha,
      cherryPickedCount: 0,
    }
  }

  // To get all the commits for the cherry-pick operation, we need to get the
  // ones already cherry-picked. If abortSafetySha is headSha; none have been
  // cherry-picked yet.
  const commitsCherryPicked =
    abortSafetySha !== headSha
      ? await getCommitsInRange(repository, revRange(headSha, abortSafetySha))
      : []

  if (commitsCherryPicked === null) {
    // This should only be possible with corrupt sequencer files resulting in a
    // bad revision range.
    return null
  }

  const commits = [...commitsCherryPicked, ...remainingCommits]
  const position = commitsCherryPicked.length + 1

  return {
    progress: {
      kind: 'multiCommitOperation',
      value: round(position / commits.length, 2),
      position,
      totalCommitCount: commits.length,
      currentCommitSummary: remainingCommits[0].summary ?? '',
    },
    remainingCommits,
    commits,
    targetBranchUndoSha: headSha,
    cherryPickedCount: commitsCherryPicked.length,
  }
}

/**
 * Proceed with the current cherry pick operation and report back on whether it completed
 *
 * It is expected that the index has staged files which are cleanly cherry
 * picked onto the base branch, and the remaining unstaged files are those which
 * need manual resolution or were changed by the user to address inline
 * conflicts.
 *
 * @param files - The working directory of files. These are the files that are
 * detected to have changes that we want to stage for the cherry pick.
 */
export async function continueCherryPick(
  repository: Repository,
  files: ReadonlyArray<WorkingDirectoryFileChange>,
  manualResolutions: ReadonlyMap<string, ManualConflictResolution> = new Map(),
  progressCallback?: (progress: IMultiCommitOperationProgress) => void
): Promise<CherryPickResult> {
  // only stage files related to cherry pick
  const trackedFiles = files.filter(f => {
    return f.status.kind !== AppFileStatusKind.Untracked
  })

  // apply conflict resolutions
  for (const [path, resolution] of manualResolutions) {
    const file = files.find(f => f.path === path)
    if (file === undefined) {
      log.error(
        `[continueCherryPick] couldn't find file ${path} even though there's a manual resolution for it`
      )
      continue
    }
    await stageManualConflictResolution(repository, file, resolution)
  }

  const otherFiles = trackedFiles.filter(f => !manualResolutions.has(f.path))
  await stageFiles(repository, otherFiles)

  const status = await getStatus(repository)
  if (status == null) {
    log.warn(
      `[continueCherryPick] unable to get status after staging changes,
        skipping any other steps`
    )
    return CherryPickResult.UnableToStart
  }

  // make sure cherry pick is still in progress to continue
  if (await !isCherryPickHeadFound(repository)) {
    return CherryPickResult.UnableToStart
  }

  let options: IGitExecutionOptions = {
    expectedErrors: new Set([
      GitError.MergeConflicts,
      GitError.ConflictModifyDeletedInBranch,
      GitError.UnresolvedConflicts,
    ]),
    env: {
      // if we don't provide editor, we can't detect git errors
      GIT_EDITOR: ':',
    },
  }

  if (progressCallback !== undefined) {
    const snapshot = await getCherryPickSnapshot(repository)
    if (snapshot === null) {
      log.warn(
        `[continueCherryPick] unable to get cherry-pick status, skipping other steps`
      )
      return CherryPickResult.UnableToStart
    }

    options = configureOptionsWithCallBack(
      options,
      snapshot.commits,
      progressCallback,
      snapshot.cherryPickedCount
    )
  }

  const trackedFilesAfter = status.workingDirectory.files.filter(
    f => f.status.kind !== AppFileStatusKind.Untracked
  )

  if (trackedFilesAfter.length === 0) {
    log.warn(
      `[cherryPick] no tracked changes to commit, continuing cherry-pick but skipping this commit`
    )

    // This commits the empty commit so that the cherry picked commit still
    // shows up in the target branches history.
    const result = await git(
      ['commit', '--allow-empty'],
      repository.path,
      'continueCherryPickSkipCurrentCommit',
      options
    )

    return parseCherryPickResult(result)
  }

  const result = await git(
    ['cherry-pick', '--continue'],
    repository.path,
    'continueCherryPick',
    options
  )

  return parseCherryPickResult(result)
}

/** Abandon the current cherry pick operation */
export async function abortCherryPick(repository: Repository) {
  await git(['cherry-pick', '--abort'], repository.path, 'abortCherryPick')
}

/**
 * Check if the `.git/CHERRY_PICK_HEAD` file exists
 */
export async function isCherryPickHeadFound(
  repository: Repository
): Promise<boolean> {
  try {
    const cherryPickHeadPath = Path.join(
      repository.path,
      '.git',
      'CHERRY_PICK_HEAD'
    )
    return pathExists(cherryPickHeadPath)
  } catch (err) {
    log.warn(
      `[cherryPick] a problem was encountered reading .git/CHERRY_PICK_HEAD,
       so it is unsafe to continue cherry-picking`,
      err
    )
    return false
  }
}
