import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { WorktreeEntry } from '../../../src/models/worktree'
import { WorktreeListItem } from '../../../src/ui/worktrees/worktree-list-item'
import { IMatches } from '../../../src/lib/fuzzy-find'
import { render, screen } from '../../helpers/ui/render'

const noMatches: IMatches = { title: [], subtitle: [] }

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

function renderItem(entry: WorktreeEntry, isCurrentWorktree = false) {
  render(
    <WorktreeListItem
      worktree={entry}
      isCurrentWorktree={isCurrentWorktree}
      matches={noMatches}
    />
  )
}

describe('WorktreeListItem', () => {
  it('renders the folder name and branch', () => {
    renderItem(worktree())

    assert.notEqual(screen.queryByText('repo-feature'), null)
    assert.notEqual(screen.queryByText('feature'), null)
  })

  it('marks a worktree whose folder is gone', () => {
    renderItem(worktree({ isPrunable: true }))

    assert.notEqual(screen.queryByText('(missing)'), null)
  })

  it('leaves an ordinary worktree unmarked', () => {
    renderItem(worktree())

    assert.equal(screen.queryByText('(missing)'), null)
  })

  it('still shows the branch of a missing worktree', () => {
    // The branch is worth keeping visible: it tells the user which branch is
    // being held by the worktree that's gone.
    renderItem(worktree({ isPrunable: true }))

    assert.notEqual(screen.queryByText('feature'), null)
  })

  it('keeps the missing marker out of the truncating name element', () => {
    // The folder name ellipsizes; the marker has to sit outside it so a long
    // name can't hide the fact that the worktree is unavailable.
    renderItem(worktree({ isPrunable: true }))

    const marker = screen.getByText('(missing)')
    const name = screen.getByText('repo-feature')

    assert.equal(marker.closest('.name'), null)
    assert.notEqual(name.closest('.name'), null)
  })
})
