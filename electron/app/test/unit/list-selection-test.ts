import { describe, it } from 'node:test'
import assert from 'node:assert'
import { findNextSelectableRow } from '../../src/ui/lib/list/selection'

describe('list-selection', () => {
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
