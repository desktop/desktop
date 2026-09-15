import { describe, it } from 'node:test'
import assert from 'node:assert'
import { formatRebaseValue } from '../../src/lib/rebase'

describe('format', () => {
  describe('formatRebaseValue', () => {
    it('clamps a negative value', () => {
      const value = -1

      const result = formatRebaseValue(value)

      assert.equal(result, 0)
    })

    it('clamps a positive value', () => {
      const value = 3

      const result = formatRebaseValue(value)

      assert.equal(result, 1)
    })

    it('formats to two significant figures', () => {
      const value = 1 / 9

      const result = formatRebaseValue(value)

      assert.equal(result, 0.11)
    })

    it('handles infinity', () => {
      const value = 1 / 0

      const result = formatRebaseValue(value)

      assert(result >= 0)
      assert(result <= 1)
    })
  })
})
