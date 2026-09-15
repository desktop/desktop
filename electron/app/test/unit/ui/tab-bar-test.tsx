import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { dragAndDropManager } from '../../../src/lib/drag-and-drop-manager'
import { TabBar, TabBarType } from '../../../src/ui/tab-bar'
import { fireEvent, render, screen } from '../../helpers/ui/render'
import {
  advanceTimersBy,
  enableTestTimers,
  resetTestTimers,
} from '../../helpers/ui/timers'

interface IRenderedTabBar {
  readonly clicks: ReadonlyArray<number>
}

function renderTabBar(
  props: Partial<React.ComponentProps<typeof TabBar>> = {}
): IRenderedTabBar {
  const clicks: Array<number> = []

  function onTabClicked(index: number) {
    clicks.push(index)
  }

  render(
    <TabBar selectedIndex={0} onTabClicked={onTabClicked} {...props}>
      {'General'}
      {'Integrations'}
      {'Advanced'}
    </TabBar>
  )

  return { clicks }
}

describe('TabBar', () => {
  beforeEach(() => {
    enableTestTimers(['setTimeout'])
  })

  afterEach(() => {
    dragAndDropManager.dragEnded(undefined)
    resetTestTimers()
  })

  it('renders a tablist and marks the selected tab', () => {
    renderTabBar({ selectedIndex: 1, type: TabBarType.Switch })

    const tablist = screen.getByRole('tablist')
    const tabs = screen.getAllByRole('tab')

    assert.ok(tablist.classList.contains('tab-bar'))
    assert.equal(tabs[0].getAttribute('aria-selected'), 'false')
    assert.equal(tabs[1].getAttribute('aria-selected'), 'true')
    assert.equal(tabs[2].getAttribute('aria-selected'), 'false')
    assert.equal(tablist.querySelectorAll('.tab-bar-separator').length, 2)
  })

  it('moves focus and emits selection when navigating with the keyboard', () => {
    const { clicks } = renderTabBar()
    const tabs = screen.getAllByRole('tab')

    tabs[0].focus()
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' })

    assert.deepEqual(clicks, [1])
    assert.equal(document.activeElement, tabs[1])
  })

  it('switches tabs after hovering during a drag operation', () => {
    const { clicks } = renderTabBar({ allowDragOverSwitching: true })
    const tabs = screen.getAllByRole('tab')

    dragAndDropManager.dragStarted()
    fireEvent.mouseEnter(tabs[2])
    advanceTimersBy(500)

    assert.deepEqual(clicks, [2])
  })
})
