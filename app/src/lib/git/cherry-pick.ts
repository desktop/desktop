import { GitError } from 'dugite'
import { Repository } from '../../models/repository'
import { git, IGitExecutionOptions, IGitResult } from './core'

/** The app-specific results from attempting to cherry pick commits*/
export enum CherryPickResult {
  /**
   * Git completed the cherry pick without reporting any errors, and the caller can
   * signal success to the user.
   */
  CompletedWithoutError = 'CompletedWithoutError',
  /**
   * The cherry pick encountered conflicts while attempting to cherry pick and
   * need to be resolved by the user can continue.
   */
  ConflictsEncountered = 'ConflictsEncountered',
  /**
   * An unexpected error as part of the cherry pick flow was caught and handled.
   *
   * Check the logs to find the relevant Git details.
   */
  Error = 'Error',
}

/**
 * A stub function to initiate cherry picking in the app.
 *
 * @param revisionRange - this could be a single commit sha or could be a range
 * of commits like sha1..sha2 or inclusively sha1^..sha2
 */
export async function cherryPick(
  repository: Repository,
  revisionRange: string
): Promise<CherryPickResult> {
  const baseOptions: IGitExecutionOptions = {
    expectedErrors: new Set([GitError.MergeConflicts]),
  }

  const result = await git(
    ['cherry-pick', revisionRange],
    repository.path,
    'cherry pick',
    baseOptions
  )

  return parseCherryPickResult(result)
}

function parseCherryPickResult(result: IGitResult): CherryPickResult {
  if (result.exitCode === 0) {
    return CherryPickResult.CompletedWithoutError
  }

  switch (result.gitError) {
    case GitError.MergeConflicts:
      return CherryPickResult.ConflictsEncountered
    default:
      throw new Error(`Unhandled result found: '${JSON.stringify(result)}'`)
  }
}
