import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { WorktreeEntry } from '../../../src/models/worktree'
import {
  WorktreeListItem,
  renderWorktreeTooltip,
} from '../../../src/ui/worktrees/worktree-list-item'
import { IMatches } from '../../../src/lib/fuzzy-find'
import { render, fireEvent, screen, waitFor } from '../../helpers/ui/render'
import {
  advanceTimersBy,
  enableTestTimers,
  resetTestTimers,
} from '../../helpers/ui/timers'

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
    renderItem(worktree({ isPrunable: true }))

    assert.notEqual(screen.queryByText('feature'), null)
  })

  it('keeps the missing marker out of the truncating name element', () => {
    renderItem(worktree({ isPrunable: true }))

    const marker = screen.getByText('(missing)')
    const name = screen.getByText('repo-feature')

    assert.equal(marker.closest('.name'), null)
    assert.notEqual(name.closest('.name'), null)
  })

  describe('tooltip', () => {
    beforeEach(() => {
      enableTestTimers(['setTimeout'])
    })

    afterEach(() => {
      resetTestTimers()
    })

    it('shows the full name and path when hovering the name', async () => {
      renderItem(worktree())

      const name = screen.getByText('repo-feature').closest('.name')

      if (name === null) {
        throw new Error('Expected the name element to be rendered')
      }

      fireEvent.mouseEnter(name, { clientX: 20, clientY: 20 })
      fireEvent.mouseMove(name, { clientX: 20, clientY: 20 })
      advanceTimersBy(400)

      await waitFor(() => {
        assert.ok(screen.getByText('Full Name:'))
        assert.ok(screen.getByText('/repo-feature'))
      })
    })
  })

  describe('renderWorktreeTooltip', () => {
    it('leaves out the branch by default', () => {
      render(renderWorktreeTooltip(worktree()))

      assert.ok(screen.getByText('/repo-feature'))
      assert.equal(screen.queryByText('Branch:'), null)
    })

    it('includes the short branch name when asked', () => {
      render(renderWorktreeTooltip(worktree(), true))

      assert.ok(screen.getByText('Branch:'))
      assert.ok(screen.getByText('feature'))
      assert.equal(screen.queryByText('refs/heads/feature'), null)
    })

    it('leaves out the branch when HEAD is detached', () => {
      render(
        renderWorktreeTooltip(
          worktree({ branch: null, isDetached: true }),
          true
        )
      )

      assert.equal(screen.queryByText('Branch:'), null)
    })
  })
})
