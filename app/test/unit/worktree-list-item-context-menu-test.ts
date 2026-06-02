import { describe, it } from 'node:test'
import assert from 'node:assert'

import { generateWorktreeContextMenuItems } from '../../src/ui/worktrees/worktree-list-item-context-menu'

describe('worktree list item context menu', () => {
  const path = '/Users/test/example-worktree'

  it('includes the new-window action when a handler is provided', () => {
    const items = generateWorktreeContextMenuItems({
      path,
      isMainWorktree: false,
      isLocked: false,
      onOpenInNewWindow: () => {},
    })

    assert(items.some(item => item.label === 'Open Worktree in New Window'))
  })

  it('omits the new-window action when no handler is provided', () => {
    const items = generateWorktreeContextMenuItems({
      path,
      isMainWorktree: false,
      isLocked: false,
    })

    assert.equal(
      items.some(item => item.label === 'Open Worktree in New Window'),
      false
    )
  })

  it('enables the new-window action for the main worktree', () => {
    const items = generateWorktreeContextMenuItems({
      path,
      isMainWorktree: true,
      isLocked: false,
      onOpenInNewWindow: () => {},
    })

    const item = items.find(
      item => item.label === 'Open Worktree in New Window'
    )

    assert(item !== undefined)
    assert.notEqual(item.enabled, false)
  })
})
