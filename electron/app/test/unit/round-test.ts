import { describe, it } from 'node:test'
import assert from 'node:assert'
import { round } from '../../src/ui/lib/round'

describe('round', () => {
  it('rounds to the desired number decimals', () => {
    assert.equal(round(1.23456789, 0), 1)
    assert.equal(round(1.23456789, 1), 1.2)
    assert.equal(round(1.23456789, 2), 1.23)
    assert.equal(round(1.23456789, 3), 1.235)
    assert.equal(round(1.23456789, 4), 1.2346)
    assert.equal(round(1.23456789, 5), 1.23457)
    assert.equal(round(1.23456789, 6), 1.234568)
  })

  it("doesn't attempt to round NaN", () => {
    assert.ok(Number.isNaN(round(NaN, 1)))
  })

  it("doesn't attempt to round infinity", () => {
    assert(!Number.isFinite(round(Infinity, 1)))
    assert(!Number.isFinite(round(-Infinity, 1)))
  })

  it("doesn't attempt to round to less than zero decimals", () => {
    assert.equal(round(1.23456789, 0), 1)
    assert.equal(round(1.23456789, -1), 1)
    assert.equal(round(1.23456789, -2), 1)
  })
})
