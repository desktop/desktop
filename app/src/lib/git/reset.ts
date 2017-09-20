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

function resetModeToFlag(mode: GitResetMode): string {
  switch (mode) {
    case GitResetMode.Hard:
      return '--hard'
    case GitResetMode.Mixed:
      return '--mixed'
    case GitResetMode.Soft:
      return '--soft'
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
  const modeFlag = resetModeToFlag(mode)
  await git(['reset', modeFlag, ref, '--'], repository.path, 'reset')
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

  const modeFlag = resetModeToFlag(mode)
  await git(['reset', modeFlag, ref, '--', ...paths], repository.path, 'reset')
}

/** Unstage all paths. */
export async function unstageAll(repository: Repository): Promise<true> {
  await git(['reset', '--', '.'], repository.path, 'unstageAll')
  return true
}
