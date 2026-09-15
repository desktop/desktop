import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { DragType } from '../../../src/models/drag-drop'
import { dragAndDropManager } from '../../../src/lib/drag-and-drop-manager'
import { BranchListItem } from '../../../src/ui/branches/branch-list-item'
import { IMatches } from '../../../src/lib/fuzzy-find'
import { fireEvent, render, screen } from '../../helpers/ui/render'
import { enableTestTimers, resetTestTimers } from '../../helpers/ui/timers'

const noMatches: IMatches = { title: [], subtitle: [] }
const now = Date.parse('2026-03-26T12:00:00.000Z')

describe('BranchListItem', () => {
  beforeEach(() => {
    enableTestTimers(['Date', 'setTimeout'], now)
  })

  afterEach(() => {
    dragAndDropManager.setDragData(null)
    dragAndDropManager.dragEnded(undefined)
    resetTestTimers()
  })

  it('renders the branch name and relative author date', () => {
    render(
      <BranchListItem
        name="main"
        isCurrentBranch={true}
        matches={noMatches}
        authorDate={new Date(now - 30 * 1000)}
      />
    )

    assert.equal(screen.getByText('main').textContent, 'main')
    assert.equal(screen.getByText('just now').textContent, 'just now')
  })

  it('drops dragged commits onto a non-current branch', () => {
    let droppedOnBranch: string | null = null

    function onDropOntoBranch(name: string) {
      droppedOnBranch = name
    }

    dragAndDropManager.setDragData({
      type: DragType.Commit,
      commits: [],
    })
    dragAndDropManager.dragStarted()

    const view = render(
      <BranchListItem
        name="release"
        isCurrentBranch={false}
        matches={noMatches}
        authorDate={undefined}
        onDropOntoBranch={onDropOntoBranch}
      />
    )

    const item = view.container.querySelector('.branches-list-item')

    assert.notEqual(item, null)

    if (item === null) {
      throw new Error('Expected branch list item to be rendered')
    }

    fireEvent.mouseEnter(item)
    assert.ok(item.classList.contains('drop-target'))

    fireEvent.mouseUp(item)

    assert.equal(droppedOnBranch, 'release')
  })

  it('drops dragged commits onto the current branch callback', () => {
    let droppedOnCurrentBranch = 0

    function onDropOntoCurrentBranch() {
      droppedOnCurrentBranch++
    }

    dragAndDropManager.setDragData({
      type: DragType.Commit,
      commits: [],
    })
    dragAndDropManager.dragStarted()

    const view = render(
      <BranchListItem
        name="main"
        isCurrentBranch={true}
        matches={noMatches}
        authorDate={undefined}
        onDropOntoCurrentBranch={onDropOntoCurrentBranch}
      />
    )

    const item = view.container.querySelector('.branches-list-item')

    assert.notEqual(item, null)

    if (item === null) {
      throw new Error('Expected branch list item to be rendered')
    }

    fireEvent.mouseEnter(item)
    fireEvent.mouseUp(item)

    assert.equal(droppedOnCurrentBranch, 1)
  })
})
