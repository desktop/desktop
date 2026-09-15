import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { fireEvent, render, screen } from '../../helpers/ui/render'
import { TabBarItem } from '../../../src/ui/tab-bar-item'
import { TabBarType } from '../../../src/ui/tab-bar-type'

interface IRenderedTabBarItem {
  readonly onClickCalls: ReadonlyArray<number>
  readonly onMouseEnterCalls: ReadonlyArray<number>
  readonly onMouseLeaveCalls: { count: number }
  readonly adjacentSelections: ReadonlyArray<{
    readonly direction: 'next' | 'previous'
    readonly index: number
  }>
  readonly buttonRefs: ReadonlyArray<HTMLButtonElement | null>
}

function renderTabBarItem(
  props: Partial<React.ComponentProps<typeof TabBarItem>> = {}
): IRenderedTabBarItem {
  const onClickCalls: Array<number> = []
  const onMouseEnterCalls: Array<number> = []
  const onMouseLeaveCalls = { count: 0 }
  const adjacentSelections: Array<{
    direction: 'next' | 'previous'
    index: number
  }> = []
  const buttonRefs: Array<HTMLButtonElement | null> = []

  function onClick(index: number) {
    onClickCalls.push(index)
  }

  function onMouseEnter(index: number) {
    onMouseEnterCalls.push(index)
  }

  function onMouseLeave() {
    onMouseLeaveCalls.count++
  }

  function onSelectAdjacent(direction: 'next' | 'previous', index: number) {
    adjacentSelections.push({ direction, index })
  }

  function onButtonRef(_index: number, button: HTMLButtonElement | null) {
    buttonRefs.push(button)
  }

  render(
    <TabBarItem
      index={2}
      selected={false}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onSelectAdjacent={onSelectAdjacent}
      onButtonRef={onButtonRef}
      {...props}
    >
      General
    </TabBarItem>
  )

  return {
    onClickCalls,
    onMouseEnterCalls,
    onMouseLeaveCalls,
    adjacentSelections,
    buttonRefs,
  }
}

describe('TabBarItem', () => {
  it('renders tab accessibility attributes based on selected state', () => {
    const { buttonRefs } = renderTabBarItem({ selected: true })

    const button = screen.getByRole('tab', { name: 'General' })

    assert.equal(button.getAttribute('aria-selected'), 'true')
    assert.equal(button.getAttribute('tabindex'), null)
    assert.equal(buttonRefs.at(-1), button)
  })

  it('clicks, hovers, and leaves with the configured item index', () => {
    const { onClickCalls, onMouseEnterCalls, onMouseLeaveCalls } =
      renderTabBarItem()

    const button = screen.getByRole('tab', { name: 'General' })

    fireEvent.click(button)
    fireEvent.mouseEnter(button)
    fireEvent.mouseLeave(button)

    assert.deepEqual(onClickCalls, [2])
    assert.deepEqual(onMouseEnterCalls, [2])
    assert.equal(onMouseLeaveCalls.count, 1)
    assert.equal(button.getAttribute('aria-selected'), 'false')
    assert.equal(button.getAttribute('tabindex'), '-1')
  })

  it('selects adjacent tabs with horizontal arrow keys', () => {
    const { adjacentSelections } = renderTabBarItem()

    const button = screen.getByRole('tab', { name: 'General' })

    fireEvent.keyDown(button, { key: 'ArrowLeft' })
    fireEvent.keyDown(button, { key: 'ArrowRight' })
    fireEvent.keyDown(button, { key: 'Enter' })

    assert.deepEqual(adjacentSelections, [
      { direction: 'previous', index: 2 },
      { direction: 'next', index: 2 },
    ])
  })

  it('selects adjacent tabs with vertical arrow keys when rendered vertically', () => {
    const { adjacentSelections } = renderTabBarItem({
      type: TabBarType.Vertical,
    })

    const button = screen.getByRole('tab', { name: 'General' })

    fireEvent.keyDown(button, { key: 'ArrowUp' })
    fireEvent.keyDown(button, { key: 'ArrowDown' })
    fireEvent.keyDown(button, { key: 'ArrowLeft' })

    assert.deepEqual(adjacentSelections, [
      { direction: 'previous', index: 2 },
      { direction: 'next', index: 2 },
    ])
  })
})
