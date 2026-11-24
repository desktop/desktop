import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as React from 'react'
import {
  findNextSelectableRow,
  isUpKeyEvent,
  isDownKeyEvent,
} from '../../src/ui/lib/list/selection'
import { fireEvent, render } from '../helpers/ui/render'

describe('list-selection', () => {
  for (const darwin of [true, false]) {
    describe(`navigation keys on ${
      darwin ? 'macOS' : 'other platforms'
    }`, () => {
      const cases = [
        { key: 'ArrowUp', ctrlKey: false, up: true, down: false },
        { key: 'ArrowDown', ctrlKey: false, up: false, down: true },
        { key: 'p', ctrlKey: true, up: darwin, down: false },
        { key: 'n', ctrlKey: true, up: false, down: darwin },
        { key: 'p', ctrlKey: false, up: false, down: false },
        { key: 'n', ctrlKey: false, up: false, down: false },
      ]

      for (const { key, ctrlKey, up, down } of cases) {
        it(`recognizes ${ctrlKey ? 'Ctrl+' : ''}${key}`, t => {
          const previousDarwin = __DARWIN__
          Object.assign(globalThis, { __DARWIN__: darwin })
          t.after(() =>
            Object.assign(globalThis, { __DARWIN__: previousDarwin })
          )

          const results: Array<{ up: boolean; down: boolean }> = []
          const view = render(
            React.createElement('input', {
              onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
                results.push({
                  up: isUpKeyEvent(event),
                  down: isDownKeyEvent(event),
                })
              },
            })
          )

          fireEvent.keyDown(view.getByRole('textbox'), { key, ctrlKey })
          assert.deepStrictEqual(results, [{ up, down }])
        })
      }
    })
  }

  describe('findNextSelectableRow', () => {
    const rowCount = 5

    it('returns first row when selecting down outside list (filter text)', () => {
      const selectedRow = findNextSelectableRow(rowCount, {
        direction: 'down',
        row: -1,
      })
      assert.equal(selectedRow, 0)
    })

    it('returns first selectable row when header is first', () => {
      const selectedRow = findNextSelectableRow(
        rowCount,
        {
          direction: 'down',
          row: -1,
        },
        row => {
          if (row === 0) {
            return false
          } else {
            return true
          }
        }
      )
      assert.equal(selectedRow, 1)
    })

    it('returns first row when selecting down from last row', () => {
      const lastRow = rowCount - 1
      const selectedRow = findNextSelectableRow(rowCount, {
        direction: 'down',
        row: lastRow,
      })
      assert.equal(selectedRow, 0)
    })

    it('returns last row when selecting up from top row', () => {
      const selectedRow = findNextSelectableRow(rowCount, {
        direction: 'up',
        row: 0,
      })
      assert.equal(selectedRow, 4)
    })
  })
})
