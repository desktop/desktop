import { git, GitError, IGitResult } from './core'
import { stageFiles } from './update-index'
import { Repository } from '../../models/repository'
import { WorkingDirectoryFileChange } from '../../models/status'
import { unstageAll } from './reset'

/**
 * @param repository repository to execute merge in
 * @param message commit message
 * @param files files to commit
 */
export async function createCommit(
  repository: Repository,
  message: string,
  files: ReadonlyArray<WorkingDirectoryFileChange>
): Promise<string | undefined> {
  // Clear the staging area, our diffs reflect the difference between the
  // working directory and the last commit (if any) so our commits should
  // do the same thing.
  await unstageAll(repository)

  await stageFiles(repository, files)

  try {
    const result = await git(
      ['commit', '-F', '-'],
      repository.path,
      'createCommit',
      {
        stdin: message,
      }
    )
    return parseCommitSHA(result)
  } catch (e) {
    logCommitError(e)
    return undefined
  }
}

/**
 * Creates a commit to finish an in-progress merge
 * assumes that all conflicts have already been resolved
 *
 * @param repository repository to execute merge in
 * @param files files to commit
 */
export async function createMergeCommit(
  repository: Repository,
  files: ReadonlyArray<WorkingDirectoryFileChange>
): Promise<string | undefined> {
  // Clear the staging area, our diffs reflect the difference between the
  // working directory and the last commit (if any) so our commits should
  // do the same thing.
  try {
    await unstageAll(repository)
    await stageFiles(repository, files)
    const result = await git(
      ['commit', '--no-edit'],
      repository.path,
      'createMergeCommit'
    )
    return parseCommitSHA(result)
  } catch (e) {
    logCommitError(e)
    return undefined
  }
}

function parseCommitSHA(result: IGitResult): string {
  return result.stdout.split(']')[0].split(' ')[1]
}

/**
 * Commit failures could come from a pre-commit hook rejection.
 * So display a bit more context than we otherwise would,
 * then re-raise the error.
 */
function logCommitError(e: Error): void {
  if (e instanceof GitError) {
    const output = e.result.stderr.trim()

    const standardError = output.length > 0 ? `, with output: '${output}'` : ''
    const { exitCode } = e.result
    const error = new Error(
      `Commit failed - exit code ${exitCode} received${standardError}`
    )
    error.name = 'commit-failed'
    throw error
  } else {
    throw e
  }
}
