import { git } from './core'
import { Repository } from '../../models/repository'
import { assertNever } from '../fatal-error'
import { WorkingDirectoryFileChange } from '../../models/status'

/** The reset modes which are supported. */
export const enum GitResetMode {
  Hard = 0,
  Soft,
  Mixed,
}

function resetModeToFlag(mode: GitResetMode): string {
  switch (mode) {
    case GitResetMode.Hard: return '--hard'
    case GitResetMode.Mixed: return '--mixed'
    case GitResetMode.Soft: return '--soft'
    default: return assertNever(mode, `Unknown reset mode: ${mode}`)
  }
}

/** Reset with the mode to the ref. */
export async function reset(repository: Repository, mode: GitResetMode, ref: string): Promise<true> {
  const modeFlag = resetModeToFlag(mode)
  await git([ 'reset', modeFlag, ref, '--' ], repository.path, 'reset')
  return true
}

/** Unstage the given files. */
export async function unstage(repository: Repository, files: ReadonlyArray<WorkingDirectoryFileChange>): Promise<true> {
  const paths = files.map(f => f.path)
  await git([ 'reset', '--', ...paths ], repository.path, 'unstage')
  return true
}
