import { ITrailer } from '../lib/git/interpret-trailers'
import { WorkingDirectoryFileChange } from './status'

/** Local opaque first-click intent, owned and validated by AppStore before warnings. */
export interface IAssistedCommitIntent {
  readonly id: string
}

/**
 * UI inputs for a Desktop-owned assisted commit operation.
 *
 * These file selections are not a snapshot or a validated commit plan.
 * The executor must capture the selected changes and validate the entire
 * plan before any staging or commits, without editing working-tree files.
 * Trailers and options apply to every generated commit.
 */
export interface ICopilotAssistedCommitRequest {
  /** Optional UI preflight capability. Never sent to the model or serialized for execution. */
  readonly intent?: IAssistedCommitIntent
  /** Selected file descriptors from which Desktop must capture a snapshot. */
  readonly files: ReadonlyArray<WorkingDirectoryFileChange>
  /** User-configured trailers to append to every generated commit. */
  readonly trailers: ReadonlyArray<ITrailer>
  /** Whether to bypass blocking commit hooks for every generated commit. */
  readonly skipCommitHooks: boolean
  /** Whether to append a Signed-off-by trailer to every generated commit. */
  readonly signOffCommits: boolean

  /**
   * With no selected files, create one empty commit without Copilot analysis.
   */
  readonly allowEmptyCommit: boolean
}
