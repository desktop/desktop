import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  WorktreeEntry,
  getSwitchableWorktrees,
} from '../../../src/models/worktree'

function worktree(
  path: string,
  overrides: Partial<WorktreeEntry> = {}
): WorktreeEntry {
  return {
    path,
    head: 'abc1234abc1234abc1234abc1234abc1234abc123',
    branch: `refs/heads/${path.split('/').pop()}`,
    isDetached: false,
    type: 'linked',
    isLocked: false,
    isPrunable: false,
    ...overrides,
  }
}

const main = worktree('/repo', { type: 'main', branch: 'refs/heads/main' })

describe('models/worktree', () => {
  describe('getSwitchableWorktrees', () => {
    it('keeps worktrees that are present on disk', () => {
      const linked = worktree('/repo-wt-a')

      assert.deepStrictEqual(getSwitchableWorktrees([main, linked]), [
        main,
        linked,
      ])
    })

    it('drops worktrees whose directory is gone', () => {
      // `git worktree list` keeps reporting a worktree after its directory has
      // been deleted, flagged prunable, until something prunes it. There's
      // nothing to switch to, so it shouldn't be offered.
      const gone = worktree('/repo-wt-gone', { isPrunable: true })

      assert.deepStrictEqual(getSwitchableWorktrees([main, gone]), [main])
    })

    it('keeps worktrees that are merely locked', () => {
      // A locked worktree still exists on disk; locking only guards it against
      // automatic pruning.
      const locked = worktree('/repo-wt-locked', { isLocked: true })

      assert.deepStrictEqual(getSwitchableWorktrees([main, locked]), [
        main,
        locked,
      ])
    })

    it('drops a prunable main worktree too', () => {
      const goneMain = worktree('/repo', { type: 'main', isPrunable: true })

      assert.deepStrictEqual(getSwitchableWorktrees([goneMain]), [])
    })

    it('returns an empty list unchanged', () => {
      assert.deepStrictEqual(getSwitchableWorktrees([]), [])
    })
  })
})
