import { describe, it } from 'node:test'
import assert from 'node:assert'
import { formatPreciseDuration } from '../../src/lib/format-duration'

describe('formatPreciseDuration', () => {
  it('returns 0s for ms less than 1000', () => {
    assert.equal(formatPreciseDuration(1), '0s')
  })

  it('return 0[unit] after encountering first whole unit', () => {
    assert.equal(formatPreciseDuration(86400000), '1d 0h 0m 0s')
    assert.equal(formatPreciseDuration(3600000), '1h 0m 0s')
    assert.equal(formatPreciseDuration(60000), '1m 0s')
    assert.equal(formatPreciseDuration(1000), '1s')
  })

  it('treats negative values as absolute numbers', () => {
    assert.equal(formatPreciseDuration(-1000), '1s')
  })
})
