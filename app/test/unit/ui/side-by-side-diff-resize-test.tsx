import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import * as React from 'react'
import { AutoSizer } from 'react-virtualized'
import { DiffParser } from '../../../src/lib/diff-parser'
import { DiffType } from '../../../src/models/diff'
import {
  AppFileStatusKind,
  CommittedFileChange,
} from '../../../src/models/status'
import { SideBySideDiff } from '../../../src/ui/diff/side-by-side-diff'
import { render } from '../../helpers/ui/render'

// jsdom has no layout engine. Supply deterministic DOM measurements, while
// exercising the real AutoSizer, List, Grid and CellMeasurer lifecycle.
describe('diff row heights after resizing', () => {
  let width = 200
  let notifyResize: () => void
  let originalHeight: PropertyDescriptor | undefined
  let originalWidth: PropertyDescriptor | undefined

  beforeEach(() => {
    width = 200
    originalHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'offsetHeight'
    )
    originalWidth = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'offsetWidth'
    )
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get() {
        return width
      },
    })
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get() {
        if (this.getAttribute('role') === 'row') {
          return this.getAttribute('aria-rowindex') === '0'
            ? 20
            : width < 600
            ? 180
            : 20
        }
        return 600
      },
    })
    const didMount = AutoSizer.prototype.componentDidMount
    mock.method(
      AutoSizer.prototype,
      'componentDidMount',
      function (this: AutoSizer) {
        notifyResize = () =>
          (this as AutoSizer & { _onResize: () => void })._onResize()
        didMount.call(this)
      }
    )
  })

  afterEach(() => {
    mock.restoreAll()
    Object.defineProperty(
      HTMLElement.prototype,
      'offsetHeight',
      originalHeight!
    )
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalWidth!)
  })

  function diff(commit: string) {
    const text = `diff --git a/NEXT.md b/NEXT.md\nnew file mode 100644\n--- /dev/null\n+++ b/NEXT.md\n@@ -0,0 +1,2 @@\n+${commit} ${'long wrapped text '.repeat(
      10
    )}\n+${'another long line '.repeat(10)}\n`
    const parsed = new DiffParser().parse(text)
    return (
      <SideBySideDiff
        file={
          new CommittedFileChange(
            'NEXT.md',
            { kind: AppFileStatusKind.New },
            commit,
            'parent'
          )
        }
        diff={{
          kind: DiffType.Text,
          text: parsed.contents,
          hunks: parsed.hunks,
          maxLineNumber: parsed.maxLineNumber,
          hasHiddenBidiChars: false,
        }}
        fileContents={null}
        hideWhitespaceInDiff={false}
        showSideBySideDiff={false}
        showDiffCheckMarks={false}
        onHideWhitespaceInDiffChanged={() => {}}
      />
    )
  }

  function resize(nextWidth: number) {
    width = nextWidth
    // AutoSizer's element resize listener runs outside React event batching.
    notifyResize()
  }

  function assertRowSpacing(container: HTMLElement, expected: number) {
    const rows = container.querySelectorAll<HTMLElement>(
      '[role=row][aria-rowindex]'
    )
    assert.equal(rows.length, 3)
    assert.equal(
      parseFloat(rows[2].style.top) - parseFloat(rows[1].style.top),
      expected
    )
    assert.equal(parseFloat(rows[1].style.height), expected)
  }

  it('remeasures wrapped rows on the first maximize', () => {
    const { container } = render(diff('first'))
    assertRowSpacing(container, 180)
    resize(1400)
    assertRowSpacing(container, 20)
  })

  it('preserves divider recovery and repeated restore/maximize behavior', () => {
    const { container } = render(diff('first'))
    resize(1400)
    resize(1390)
    assertRowSpacing(container, 20)
    resize(200)
    assertRowSpacing(container, 180)
    resize(1400)
    assertRowSpacing(container, 20)
  })

  it('remeasures after switching commits while the window is narrow', () => {
    const { container, rerender } = render(diff('first'))
    resize(1400)
    resize(1390)
    resize(200)
    rerender(diff('second'))
    assertRowSpacing(container, 180)
    resize(1400)
    assertRowSpacing(container, 20)
  })
})
