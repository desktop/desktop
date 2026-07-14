import { describe, it } from 'node:test'
import assert from 'node:assert'
import { offsetFrom, offsetFromNow } from '../../src/lib/offset-from'

describe('offset-from', () => {
  describe('offsetFrom with number input', () => {
    it('offsets by seconds', () => {
      const base = 1000000
      const result = offsetFrom(base, 5, 'seconds')
      assert.equal(result, 1005000)
    })

    it('offsets by minutes', () => {
      const base = 0
      const result = offsetFrom(base, 2, 'minutes')
      assert.equal(result, 120000)
    })

    it('offsets by hours', () => {
      const base = 0
      const result = offsetFrom(base, 1, 'hour')
      assert.equal(result, 3600000)
    })

    it('offsets by days', () => {
      const base = 0
      const result = offsetFrom(base, 1, 'day')
      assert.equal(result, 86400000)
    })

    it('offsets by years', () => {
      const base = 0
      const result = offsetFrom(base, 1, 'year')
      assert.equal(result, 31536000000)
    })

    it('handles negative offsets', () => {
      const base = 100000
      const result = offsetFrom(base, -1, 'seconds')
      assert.equal(result, 99000)
    })

    it('returns a number when given a number', () => {
      const result = offsetFrom(0, 1, 'second')
      assert.equal(typeof result, 'number')
    })
  })

  describe('offsetFrom with Date input', () => {
    it('returns a Date when given a Date', () => {
      const base = new Date(2025, 0, 1)
      const result = offsetFrom(base, 1, 'day')
      assert.ok(result instanceof Date)
    })

    it('offsets a Date by the correct amount', () => {
      const base = new Date('2025-01-01T00:00:00Z')
      const result = offsetFrom(base, 1, 'day') as Date
      assert.equal(result.toISOString(), '2025-01-02T00:00:00.000Z')
    })

    it('offsets a Date by negative amount', () => {
      const base = new Date('2025-01-02T00:00:00Z')
      const result = offsetFrom(base, -1, 'day') as Date
      assert.equal(result.toISOString(), '2025-01-01T00:00:00.000Z')
    })
  })

  describe('offsetFromNow', () => {
    it('returns a timestamp close to now plus the offset', () => {
      const before = Date.now()
      const result = offsetFromNow(1, 'second')
      const after = Date.now()

      // result should be approximately now + 1000ms
      assert.ok(result >= before + 1000)
      assert.ok(result <= after + 1000)
    })

    it('returns a past timestamp for negative offsets', () => {
      const before = Date.now()
      const result = offsetFromNow(-1, 'hour')

      assert.ok(result < before)
      assert.ok(result >= before - 3600000 - 100) // small tolerance
    })
  })
})
