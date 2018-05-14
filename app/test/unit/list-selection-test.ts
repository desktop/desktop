import { expect } from 'chai'

import { findNextSelectableRow } from '../../src/ui/lib/list/selection'

describe('list-selection', () => {
  describe('findNextSelectableRow', () => {
    const rowCount = 5

    it('returns first row when selecting down', () => {
      const lastRow = rowCount - 1
      const selectedRow = findNextSelectableRow(rowCount, {
        direction: 'down',
        row: lastRow,
      })
      expect(selectedRow).to.equal(0)
    })

    it('returns last row when selecting up from top', () => {
      const selectedRow = findNextSelectableRow(rowCount, {
        direction: 'up',
        row: 0,
      })
      expect(selectedRow).to.equal(4)
    })
  })
})
