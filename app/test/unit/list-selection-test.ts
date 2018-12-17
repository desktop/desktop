import { expect } from 'chai'

import { findNextSelectableRow } from '../../src/ui/lib/list/selection'

describe('list-selection', () => {
  describe('findNextSelectableRow', () => {
    const rowCount = 5

    it('returns first row when selecting down outside list (filter text)', () => {
      const selectedRow = findNextSelectableRow(rowCount, {
        direction: 'down',
        row: -1,
      })
      expect(selectedRow).to.equal(0)
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
      expect(selectedRow).to.equal(1)
    })

    it('returns first row when selecting down from last row', () => {
      const lastRow = rowCount - 1
      const selectedRow = findNextSelectableRow(rowCount, {
        direction: 'down',
        row: lastRow,
      })
      expect(selectedRow).to.equal(0)
    })

    it('returns last row when selecting up from top row', () => {
      const selectedRow = findNextSelectableRow(rowCount, {
        direction: 'up',
        row: 0,
      })
      expect(selectedRow).to.equal(4)
    })
  })
})
