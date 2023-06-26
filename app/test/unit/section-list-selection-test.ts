import { InvalidRowIndexPath } from '../../src/ui/lib/list/list-row-index-path'
import { findNextSelectableRow } from '../../src/ui/lib/list/section-list-selection'

describe('section-list-selection', () => {
  describe('findNextSelectableRow', () => {
    const rowCount = [5]

    it('returns first row when selecting down outside list (filter text)', () => {
      const selectedRow = findNextSelectableRow(rowCount, {
        direction: 'down',
        row: InvalidRowIndexPath,
      })
      expect(selectedRow?.row).toBe(0)
    })

    it('returns first selectable row when header is first', () => {
      const selectedRow = findNextSelectableRow(
        rowCount,
        {
          direction: 'down',
          row: InvalidRowIndexPath,
        },
        row => {
          if (row.section === 0 && row.row === 0) {
            return false
          } else {
            return true
          }
        }
      )
      expect(selectedRow?.row).toBe(1)
    })

    it('returns first row when selecting down from last row', () => {
      const lastRow = rowCount[0] - 1
      const selectedRow = findNextSelectableRow(rowCount, {
        direction: 'down',
        row: {
          section: 0,
          row: lastRow,
        },
      })
      expect(selectedRow?.row).toBe(0)
    })

    it('returns last row when selecting up from top row', () => {
      const selectedRow = findNextSelectableRow(rowCount, {
        direction: 'up',
        row: {
          section: 0,
          row: 0,
        },
      })
      expect(selectedRow?.row).toBe(4)
    })
  })
})
