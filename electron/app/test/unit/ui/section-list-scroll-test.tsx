import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { SectionList } from '../../../src/ui/lib/list/section-list'
import { RowIndexPath } from '../../../src/ui/lib/list/list-row-index-path'
import { render, waitFor } from '../../helpers/ui/render'

const LIST_HEIGHT = 360
const LIST_WIDTH = 365
const ROW_HEIGHT = 29

/**
 * A ResizeObserver test double that reports a fixed size to the observed
 * element and invokes the callback synchronously, mirroring the pattern used
 * by the other react-virtualized backed component tests.
 */
class TestListResizeObserver implements ResizeObserver {
  public constructor(private readonly callback: ResizeObserverCallback) {}

  public observe(target: Element) {
    Object.defineProperty(target, 'offsetWidth', {
      configurable: true,
      value: LIST_WIDTH,
    })
    Object.defineProperty(target, 'offsetHeight', {
      configurable: true,
      value: LIST_HEIGHT,
    })

    const contentRect = {
      x: 0,
      y: 0,
      width: LIST_WIDTH,
      height: LIST_HEIGHT,
      top: 0,
      right: LIST_WIDTH,
      bottom: LIST_HEIGHT,
      left: 0,
      toJSON: () => ({}),
    }

    this.callback(
      [
        {
          target,
          contentRect,
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        },
      ],
      this
    )
  }

  public unobserve() {}

  public disconnect() {}
}

let hadGlobalResizeObserver = false
let originalGlobalResizeObserver: typeof ResizeObserver | undefined
let hadWindowResizeObserver = false
let originalWindowResizeObserver: typeof ResizeObserver | undefined

beforeEach(() => {
  hadGlobalResizeObserver = 'ResizeObserver' in globalThis
  originalGlobalResizeObserver = globalThis.ResizeObserver
  hadWindowResizeObserver =
    typeof window !== 'undefined' && 'ResizeObserver' in window
  originalWindowResizeObserver =
    typeof window !== 'undefined' ? window.ResizeObserver : undefined

  Object.assign(globalThis, { ResizeObserver: TestListResizeObserver })
  if (typeof window !== 'undefined') {
    Object.assign(window, { ResizeObserver: TestListResizeObserver })
  }
})

afterEach(() => {
  if (hadGlobalResizeObserver) {
    Object.assign(globalThis, { ResizeObserver: originalGlobalResizeObserver })
  } else {
    Reflect.deleteProperty(globalThis, 'ResizeObserver')
  }

  if (typeof window !== 'undefined') {
    if (hadWindowResizeObserver) {
      Object.assign(window, { ResizeObserver: originalWindowResizeObserver })
    } else {
      Reflect.deleteProperty(window, 'ResizeObserver')
    }
  }
})

function renderSectionList(rowCount: ReadonlyArray<number>) {
  return render(
    <SectionList
      rowCount={rowCount}
      rowHeight={ROW_HEIGHT}
      selectedRows={[]}
      rowRenderer={(indexPath: RowIndexPath) => (
        <div>{`row ${indexPath.section}-${indexPath.row}`}</div>
      )}
    />
  )
}

describe('SectionList scrolling', () => {
  it('never makes per-section grids independently scrollable', async () => {
    // The first section is far taller than the visible list height, the rest
    // fit comfortably. This reproduces the repository list layout where one
    // group (e.g. a large organization) is taller than the foldout.
    const tallSectionRowCount = Math.ceil((LIST_HEIGHT / ROW_HEIGHT) * 3)
    const { container } = renderSectionList([tallSectionRowCount, 3, 3])

    // Wait for the deferred ResizeObserver driven measurement to flush and the
    // section grids to render.
    await waitFor(() => {
      assert.ok(
        container.querySelector('.ReactVirtualized__Grid[role="listbox"]') !==
          null,
        'expected at least one section grid to render'
      )
    })

    const sectionGrids = container.querySelectorAll<HTMLElement>(
      '.ReactVirtualized__Grid[role="listbox"]'
    )

    // Each per-section grid is a passive window driven by the parent's scroll
    // position. If any of them is independently scrollable it will capture the
    // mouse wheel instead of letting the outer scroll container handle it,
    // producing the "stuck/jerky" scrolling reported in #22387.
    for (const grid of sectionGrids) {
      assert.notStrictEqual(
        grid.style.overflowY,
        'auto',
        'a per-section grid was left independently scrollable (overflow-y: auto)'
      )
    }
  })
})
