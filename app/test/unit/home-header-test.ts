import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  formatHomeDate,
  formatHomeTime,
} from '../../src/ui/changes/home-header'

describe('home header', () => {
  const date = new Date(2026, 8, 30, 9, 5)

  it('formats the date with the weekday', () => {
    assert.equal(formatHomeDate(date), '9月30日 水曜日')
  })

  it('formats the time as 24 hour HH:mm', () => {
    assert.equal(formatHomeTime(date), '09:05')
    assert.equal(formatHomeTime(new Date(2026, 8, 30, 21, 45)), '21:45')
  })
})
