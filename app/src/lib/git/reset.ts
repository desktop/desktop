import { git } from './core'
import { Repository } from '../../models/repository'
import { assertNever } from '../fatal-error'

/** The reset modes which are supported. */
export const enum GitResetMode {
  Hard = 0,
  Soft,
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

/** Unstage all paths. */
export async function unstageAll(repository: Repository): Promise<true> {
  await git(['reset', '--', '.'], repository.path, 'unstageAll')
  return true
}
