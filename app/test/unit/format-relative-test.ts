import { describe, it } from 'node:test'
import assert from 'node:assert'
import { formatRelative } from '../../src/lib/format-relative'

const SECOND = 1000
const MINUTE = SECOND * 60
const HOUR = MINUTE * 60
const DAY = HOUR * 24

describe('formatRelative', () => {
  it('formats elapsed time in seconds, minutes and hours', () => {
    assert.equal(formatRelative(-5 * SECOND), '5 seconds ago')
    assert.equal(formatRelative(-5 * MINUTE), '5 minutes ago')
    assert.equal(formatRelative(-5 * HOUR), '5 hours ago')
  })

  it('formats elapsed time in days up to a month', () => {
    assert.equal(formatRelative(-13 * DAY), '13 days ago')
    assert.equal(formatRelative(-29 * DAY), '29 days ago')
  })

  it('keeps day precision for dates that may still fall within the current calendar month', () => {
    // A commit from July 1st viewed on July 31st
    assert.equal(formatRelative(-30 * DAY), '30 days ago')

    // Late in the day the elapsed time rounds up to 31 days
    assert.equal(formatRelative(-30.99 * DAY), '31 days ago')
    assert.equal(formatRelative(-31 * DAY), '31 days ago')
  })

  it('formats elapsed time in months after a month', () => {
    assert.equal(formatRelative(-32 * DAY), 'last month')
    assert.equal(formatRelative(-40 * DAY), 'last month')
    assert.equal(formatRelative(-61 * DAY), '2 months ago')
    // The months tier extends up to 18 months
    assert.equal(formatRelative(-12 * 30 * DAY), '12 months ago')
  })

  it('formats elapsed time in years after 18 months', () => {
    assert.equal(formatRelative(-24 * 30 * DAY), '2 years ago')
  })

  it('formats future dates with an "in" prefix', () => {
    assert.equal(formatRelative(5 * SECOND), 'in 5 seconds')
    assert.equal(formatRelative(30 * DAY), 'in 30 days')
    assert.equal(formatRelative(61 * DAY), 'in 2 months')
  })
})
