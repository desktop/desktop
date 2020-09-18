import { round } from '../../src/ui/lib/round'

describe('round', () => {
  it('rounds to the desired number decimals', () => {
    expect(round(1.23456789, 0)).toBe(1)
    expect(round(1.23456789, 1)).toBe(1.2)
    expect(round(1.23456789, 2)).toBe(1.23)
    expect(round(1.23456789, 3)).toBe(1.235)
    expect(round(1.23456789, 4)).toBe(1.2346)
    expect(round(1.23456789, 5)).toBe(1.23457)
    expect(round(1.23456789, 6)).toBe(1.234568)
  })

  it("doesn't attempt to round NaN", () => {
    expect(round(NaN, 1)).toBeNaN()
  })

  it("doesn't attempt to round infinity", () => {
    expect(round(Infinity, 1)).not.toBeFinite()
    expect(round(-Infinity, 1)).not.toBeFinite()
  })

  it("doesn't attempt to round to less than zero decimals", () => {
    expect(round(1.23456789, 0)).toBe(1)
    expect(round(1.23456789, -1)).toBe(1)
    expect(round(1.23456789, -2)).toBe(1)
  })
})
