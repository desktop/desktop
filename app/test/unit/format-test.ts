import { formatRebaseValue } from '../../src/lib/rebase'

describe('format', () => {
  describe('formatRebaseValue', () => {
    it('clamps a negative value', () => {
      const value = -1

      const result = formatRebaseValue(value)

      expect(result).toEqual(0)
    })

    it('clamps a positive value', () => {
      const value = 3

      const result = formatRebaseValue(value)

      expect(result).toEqual(1)
    })

    it('formats to two significant figures', () => {
      const value = 1 / 9

      const result = formatRebaseValue(value)

      expect(result).toEqual(0.11)
    })

    it('handles infinity', () => {
      const value = 1 / 0

      const result = formatRebaseValue(value)

      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThanOrEqual(1)
    })
  })
})
