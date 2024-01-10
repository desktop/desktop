import { formatPreciseDuration } from '../../src/lib/format-duration'

describe('formatPreciseDuration', () => {
  it('returns 0s for ms less than 1000', () => {
    expect(formatPreciseDuration(1)).toBe('0s')
  })

  it('return 0[unit] after encountering first whole unit', () => {
    expect(formatPreciseDuration(86400000)).toBe('1d 0h 0m 0s')
    expect(formatPreciseDuration(3600000)).toBe('1h 0m 0s')
    expect(formatPreciseDuration(60000)).toBe('1m 0s')
    expect(formatPreciseDuration(1000)).toBe('1s')
  })

  it('treats negative values as absolute numbers', () => {
    expect(formatPreciseDuration(-1000)).toBe('1s')
  })
})
