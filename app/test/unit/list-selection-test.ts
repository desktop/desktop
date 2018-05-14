import { expect } from 'chai'

import { findNextSelectableRow } from '../../src/ui/lib/list/selection'

describe('list-selection', () => {
  describe('findNextSelectableRow', () => {
    it('returns first row when selecting down from outside range', () => {
      const selectedRow = findNextSelectableRow(2, {
        direction: 'down',
        row: -1,
      })
      expect(selectedRow).to.equal(0)
    })
  })
})
