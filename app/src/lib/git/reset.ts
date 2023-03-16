import { git } from './core'
import { Repository } from '../../models/repository'
import { assertNever } from '../fatal-error'

/** The reset modes which are supported. */
export const enum GitResetMode {
  /**
   * Resets the index and working tree. Any changes to tracked files in the
   * working tree since <commit> are discarded.
   */
  Hard = 0,
  /**
   * Does not touch the index file or the working tree at all (but resets the
   * head to <commit>, just like all modes do). This leaves all your changed
   * files "Changes to be committed", as git status would put it.
   */
  Soft,

  /**
   * Resets the index but not the working tree (i.e., the changed files are
   * preserved but not marked for commit) and reports what has not been updated.
   * This is the default action for git reset.
   */
  Mixed,
}

function resetModeToArgs(mode: GitResetMode, ref: string): string[] {
  switch (mode) {
    case GitResetMode.Hard:
      return ['reset', '--hard', ref]
    case GitResetMode.Mixed:
      return ['reset', ref]
    case GitResetMode.Soft:
      return ['reset', '--soft', ref]
    default:
      return assertNever(mode, `Unknown reset mode: ${mode}`)
  }
}

/** Reset with the mode to the ref. */
export async function reset(
  repository: Repository,
  mode: GitResetMode,
  ref: string
): Promise<true> {
  const args = resetModeToArgs(mode, ref)
  await git(args, repository.path, 'reset')
  return true
}

/**
 * Updates the index with information from a particular tree for a given
 * set of paths.
 *
 * @param repository The repository in which to reset the index.
 *
 * @param mode      Which mode to use when resetting, see the GitResetMode
 *                  enum for more information.
 *
 * @param ref       A string which resolves to a tree, for example 'HEAD' or a
 *                  commit sha.
 *
 * @param paths     The paths that should be updated in the index with information
 *                  from the given tree
 */
export async function resetPaths(
  repository: Repository,
  mode: GitResetMode,
  ref: string,
  paths: ReadonlyArray<string>
): Promise<void> {
  if (!paths.length) {
    return
  }

  const baseArgs = resetModeToArgs(mode, ref)

  if (__WIN32__ && mode === GitResetMode.Mixed) {
    // Git for Windows has experimental support for reading paths to reset
    // from standard input. This is helpful in situations where your file
    // paths are greater than 32KB in length, because of shell limitations.
    //
    // This hasn't made it to Git core, so we fallback to the default behaviour
    // as macOS and Linux don't have this same shell limitation. See
    // https://github.com/desktop/desktop/issues/2833#issuecomment-331352952
    // for more context.
    const args = [...baseArgs, '--stdin', '-z', '--']
    await git(args, repository.path, 'resetPaths', {
      stdin: paths.join('\0'),
    })
  } else {
    const args = [...baseArgs, '--', ...paths]
    await git(args, repository.path, 'resetPaths')
  }
}

/** Unstage all paths. */
export async function unstageAll(repository: Repository): Promise<true> {
  await git(['reset', '--', '.'], repository.path, 'unstageAll')
  return true
}
