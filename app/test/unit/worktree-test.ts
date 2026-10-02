import assert from 'node:assert'
import { describe, it } from 'node:test'

import { WorktreeEntry, getWorktreeAriaLabel } from '../../src/models/worktree'

function worktree(overrides: Partial<WorktreeEntry> = {}): WorktreeEntry {
  return {
    path: '/repo-feature',
    head: 'abc1234abc1234abc1234abc1234abc1234abc123',
    branch: 'refs/heads/feature',
    isDetached: false,
    type: 'linked',
    isLocked: false,
    isPrunable: false,
    ...overrides,
  }
}

describe('getWorktreeAriaLabel', () => {
  it('names the worktree and its branch', () => {
    assert.equal(getWorktreeAriaLabel(worktree()), 'repo-feature, feature')
  })

  it('announces a missing worktree', () => {
    assert.equal(
      getWorktreeAriaLabel(worktree({ isPrunable: true })),
      'repo-feature, missing, feature'
    )
  })
})
