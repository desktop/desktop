import { describe, it } from 'node:test'
import * as assert from 'node:assert'
import { formatNumber, formatCompactNumber } from '../../src/lib/format-number'
import { INumberFormat } from '../../src/models/formatting-preferences'

// Standard number formats for testing
const commaThousandsDotDecimal: INumberFormat = {
  thousandsSeparator: ',',
  decimalSeparator: '.',
}

const dotThousandsCommaDecimal: INumberFormat = {
  thousandsSeparator: '.',
  decimalSeparator: ',',
}

const spaceThousandsDotDecimal: INumberFormat = {
  thousandsSeparator: ' ',
  decimalSeparator: '.',
}

const spaceThousandsCommaDecimal: INumberFormat = {
  thousandsSeparator: ' ',
  decimalSeparator: ',',
}

const noThousandsDotDecimal: INumberFormat = {
  thousandsSeparator: '',
  decimalSeparator: '.',
}

const noThousandsCommaDecimal: INumberFormat = {
  thousandsSeparator: '',
  decimalSeparator: ',',
}

describe('formatNumber', () => {
  describe('integers', () => {
    it('formats small integers without thousands separator', () => {
      assert.strictEqual(formatNumber(0, commaThousandsDotDecimal), '0')
      assert.strictEqual(formatNumber(1, commaThousandsDotDecimal), '1')
      assert.strictEqual(formatNumber(42, commaThousandsDotDecimal), '42')
      assert.strictEqual(formatNumber(999, commaThousandsDotDecimal), '999')
    })

    it('formats thousands with comma separator', () => {
      assert.strictEqual(formatNumber(1000, commaThousandsDotDecimal), '1,000')
      assert.strictEqual(
        formatNumber(12345, commaThousandsDotDecimal),
        '12,345'
      )
      assert.strictEqual(
        formatNumber(999999, commaThousandsDotDecimal),
        '999,999'
      )
    })

    it('formats millions with multiple separators', () => {
      assert.strictEqual(
        formatNumber(1000000, commaThousandsDotDecimal),
        '1,000,000'
      )
      assert.strictEqual(
        formatNumber(1234567890, commaThousandsDotDecimal),
        '1,234,567,890'
      )
    })

    it('formats thousands with dot separator (European style)', () => {
      assert.strictEqual(formatNumber(1000, dotThousandsCommaDecimal), '1.000')
      assert.strictEqual(
        formatNumber(12345, dotThousandsCommaDecimal),
        '12.345'
      )
      assert.strictEqual(
        formatNumber(1234567, dotThousandsCommaDecimal),
        '1.234.567'
      )
    })

    it('formats thousands with space separator', () => {
      assert.strictEqual(formatNumber(1000, spaceThousandsDotDecimal), '1 000')
      assert.strictEqual(
        formatNumber(12345, spaceThousandsDotDecimal),
        '12 345'
      )
      assert.strictEqual(
        formatNumber(1234567, spaceThousandsDotDecimal),
        '1 234 567'
      )
    })

    it('formats without thousands separator when configured', () => {
      assert.strictEqual(formatNumber(1000, noThousandsDotDecimal), '1000')
      assert.strictEqual(formatNumber(12345, noThousandsDotDecimal), '12345')
      assert.strictEqual(
        formatNumber(1234567, noThousandsDotDecimal),
        '1234567'
      )
    })
  })

  describe('decimals', () => {
    it('formats decimals with dot separator', () => {
      assert.strictEqual(formatNumber(1.5, commaThousandsDotDecimal), '1.5')
      assert.strictEqual(
        formatNumber(3.14159, commaThousandsDotDecimal),
        '3.14159'
      )
      assert.strictEqual(formatNumber(0.123, commaThousandsDotDecimal), '0.123')
    })

    it('formats decimals with comma separator (European style)', () => {
      assert.strictEqual(formatNumber(1.5, dotThousandsCommaDecimal), '1,5')
      assert.strictEqual(
        formatNumber(3.14159, dotThousandsCommaDecimal),
        '3,14159'
      )
      assert.strictEqual(formatNumber(0.123, dotThousandsCommaDecimal), '0,123')
    })

    it('formats large numbers with decimals', () => {
      assert.strictEqual(
        formatNumber(1234567.89, commaThousandsDotDecimal),
        '1,234,567.89'
      )
      assert.strictEqual(
        formatNumber(1234567.89, dotThousandsCommaDecimal),
        '1.234.567,89'
      )
      assert.strictEqual(
        formatNumber(1234567.89, spaceThousandsDotDecimal),
        '1 234 567.89'
      )
    })
  })

  describe('negative numbers', () => {
    it('formats negative integers', () => {
      assert.strictEqual(formatNumber(-1, commaThousandsDotDecimal), '-1')
      assert.strictEqual(
        formatNumber(-1000, commaThousandsDotDecimal),
        '-1,000'
      )
      assert.strictEqual(
        formatNumber(-1234567, commaThousandsDotDecimal),
        '-1,234,567'
      )
    })

    it('formats negative decimals', () => {
      assert.strictEqual(formatNumber(-1.5, commaThousandsDotDecimal), '-1.5')
      assert.strictEqual(
        formatNumber(-1234.56, commaThousandsDotDecimal),
        '-1,234.56'
      )
    })
  })

  describe('edge cases', () => {
    it('handles Infinity', () => {
      assert.strictEqual(
        formatNumber(Infinity, commaThousandsDotDecimal),
        'Infinity'
      )
      assert.strictEqual(
        formatNumber(-Infinity, commaThousandsDotDecimal),
        '-Infinity'
      )
    })

    it('handles NaN', () => {
      assert.strictEqual(formatNumber(NaN, commaThousandsDotDecimal), 'NaN')
    })

    it('handles very small decimals', () => {
      assert.strictEqual(formatNumber(0.001, commaThousandsDotDecimal), '0.001')
      assert.strictEqual(
        formatNumber(0.000001, commaThousandsDotDecimal),
        '0.000001'
      )
    })
  })
})

describe('formatCompactNumber', () => {
  describe('small numbers (< 1000)', () => {
    it('formats small numbers without compaction', () => {
      assert.strictEqual(
        formatCompactNumber(0, { numberFormat: commaThousandsDotDecimal }),
        '0'
      )
      assert.strictEqual(
        formatCompactNumber(1, { numberFormat: commaThousandsDotDecimal }),
        '1'
      )
      assert.strictEqual(
        formatCompactNumber(42, { numberFormat: commaThousandsDotDecimal }),
        '42'
      )
      assert.strictEqual(
        formatCompactNumber(999, { numberFormat: commaThousandsDotDecimal }),
        '999'
      )
    })

    it('formats small decimals without compaction', () => {
      assert.strictEqual(
        formatCompactNumber(1.5, { numberFormat: commaThousandsDotDecimal }),
        '1.5'
      )
      assert.strictEqual(
        formatCompactNumber(123.45, { numberFormat: commaThousandsDotDecimal }),
        '123.45'
      )
    })
  })

  describe('thousands (k)', () => {
    it('formats thousands with k suffix', () => {
      assert.strictEqual(
        formatCompactNumber(1000, { numberFormat: commaThousandsDotDecimal }),
        '1k'
      )
      assert.strictEqual(
        formatCompactNumber(1500, { numberFormat: commaThousandsDotDecimal }),
        '1.5k'
      )
      assert.strictEqual(
        formatCompactNumber(9999, { numberFormat: commaThousandsDotDecimal }),
        '10k'
      )
    })

    it('shows one decimal for values under 10k', () => {
      assert.strictEqual(
        formatCompactNumber(1234, { numberFormat: commaThousandsDotDecimal }),
        '1.2k'
      )
      assert.strictEqual(
        formatCompactNumber(5678, { numberFormat: commaThousandsDotDecimal }),
        '5.7k'
      )
    })

    it('shows no decimals for values 10k and above', () => {
      assert.strictEqual(
        formatCompactNumber(10000, { numberFormat: commaThousandsDotDecimal }),
        '10k'
      )
      assert.strictEqual(
        formatCompactNumber(12345, { numberFormat: commaThousandsDotDecimal }),
        '12k'
      )
      assert.strictEqual(
        formatCompactNumber(99999, { numberFormat: commaThousandsDotDecimal }),
        '100k'
      )
    })

    it('uses configured decimal separator', () => {
      assert.strictEqual(
        formatCompactNumber(1234, { numberFormat: dotThousandsCommaDecimal }),
        '1,2k'
      )
      assert.strictEqual(
        formatCompactNumber(5678, { numberFormat: spaceThousandsCommaDecimal }),
        '5,7k'
      )
    })
  })

  describe('millions (m)', () => {
    it('formats millions with m suffix', () => {
      assert.strictEqual(
        formatCompactNumber(1000000, {
          numberFormat: commaThousandsDotDecimal,
        }),
        '1m'
      )
      assert.strictEqual(
        formatCompactNumber(1500000, {
          numberFormat: commaThousandsDotDecimal,
        }),
        '1.5m'
      )
    })

    it('shows one decimal for values under 10m', () => {
      assert.strictEqual(
        formatCompactNumber(1234567, {
          numberFormat: commaThousandsDotDecimal,
        }),
        '1.2m'
      )
      assert.strictEqual(
        formatCompactNumber(9876543, {
          numberFormat: commaThousandsDotDecimal,
        }),
        '9.9m'
      )
    })

    it('shows no decimals for values 10m and above', () => {
      assert.strictEqual(
        formatCompactNumber(10000000, {
          numberFormat: commaThousandsDotDecimal,
        }),
        '10m'
      )
      assert.strictEqual(
        formatCompactNumber(99999999, {
          numberFormat: commaThousandsDotDecimal,
        }),
        '100m'
      )
    })
  })

  describe('billions (b)', () => {
    it('formats billions with b suffix', () => {
      assert.strictEqual(
        formatCompactNumber(1000000000, {
          numberFormat: commaThousandsDotDecimal,
        }),
        '1b'
      )
      assert.strictEqual(
        formatCompactNumber(1500000000, {
          numberFormat: commaThousandsDotDecimal,
        }),
        '1.5b'
      )
    })

    it('shows one decimal for values under 10b', () => {
      assert.strictEqual(
        formatCompactNumber(1234567890, {
          numberFormat: commaThousandsDotDecimal,
        }),
        '1.2b'
      )
    })

    it('shows no decimals for values 10b and above', () => {
      assert.strictEqual(
        formatCompactNumber(10000000000, {
          numberFormat: commaThousandsDotDecimal,
        }),
        '10b'
      )
    })
  })

  describe('trillions (t)', () => {
    it('formats trillions with t suffix', () => {
      assert.strictEqual(
        formatCompactNumber(1000000000000, {
          numberFormat: commaThousandsDotDecimal,
        }),
        '1t'
      )
      assert.strictEqual(
        formatCompactNumber(1500000000000, {
          numberFormat: commaThousandsDotDecimal,
        }),
        '1.5t'
      )
    })

    it('caps at trillion for extremely large numbers', () => {
      // Quadrillions and beyond still use 't' suffix
      assert.strictEqual(
        formatCompactNumber(1000000000000000, {
          numberFormat: commaThousandsDotDecimal,
        }),
        '1,000t'
      )
    })
  })

  describe('edge cases', () => {
    it('handles Infinity', () => {
      assert.strictEqual(
        formatCompactNumber(Infinity, {
          numberFormat: commaThousandsDotDecimal,
        }),
        'Infinity'
      )
      assert.strictEqual(
        formatCompactNumber(-Infinity, {
          numberFormat: commaThousandsDotDecimal,
        }),
        '-Infinity'
      )
    })

    it('handles NaN', () => {
      assert.strictEqual(
        formatCompactNumber(NaN, { numberFormat: commaThousandsDotDecimal }),
        'NaN'
      )
    })

    it('handles negative large numbers', () => {
      assert.strictEqual(
        formatCompactNumber(-1234, { numberFormat: commaThousandsDotDecimal }),
        '-1.2k'
      )
      assert.strictEqual(
        formatCompactNumber(-1000000, {
          numberFormat: commaThousandsDotDecimal,
        }),
        '-1m'
      )
    })
  })

  describe('explicit decimals', () => {
    it('uses explicit decimals when provided', () => {
      // By default, 12345 would show '12k' (0 decimals for >= 10)
      // With explicit decimals: 2, it should show '12.35k'
      assert.strictEqual(
        formatCompactNumber(12345, {
          numberFormat: commaThousandsDotDecimal,
          decimals: 2,
        }),
        '12.35k'
      )
    })

    it('respects explicit decimals of 0', () => {
      // By default, 1234 would show '1.2k' (1 decimal for < 10)
      // With explicit decimals: 0, it should show '1k'
      assert.strictEqual(
        formatCompactNumber(1234, {
          numberFormat: commaThousandsDotDecimal,
          decimals: 0,
        }),
        '1k'
      )
    })

    it('works with explicit decimals across magnitude boundaries', () => {
      assert.strictEqual(
        formatCompactNumber(1234567, {
          numberFormat: commaThousandsDotDecimal,
          decimals: 3,
        }),
        '1.235m'
      )
      assert.strictEqual(
        formatCompactNumber(1234567890, {
          numberFormat: commaThousandsDotDecimal,
          decimals: 2,
        }),
        '1.23b'
      )
    })

    it('uses configured decimal separator with explicit decimals', () => {
      assert.strictEqual(
        formatCompactNumber(12345, {
          numberFormat: dotThousandsCommaDecimal,
          decimals: 2,
        }),
        '12,35k'
      )
    })
  })

  describe('all format configurations', () => {
    it('works with space thousands and dot decimal', () => {
      assert.strictEqual(
        formatCompactNumber(1234, { numberFormat: spaceThousandsDotDecimal }),
        '1.2k'
      )
      assert.strictEqual(
        formatCompactNumber(1000000000000000, {
          numberFormat: spaceThousandsDotDecimal,
        }),
        '1 000t'
      )
    })

    it('works with space thousands and comma decimal', () => {
      assert.strictEqual(
        formatCompactNumber(1234, { numberFormat: spaceThousandsCommaDecimal }),
        '1,2k'
      )
    })

    it('works with no thousands separator', () => {
      assert.strictEqual(
        formatCompactNumber(1234, { numberFormat: noThousandsDotDecimal }),
        '1.2k'
      )
      assert.strictEqual(
        formatCompactNumber(1234, { numberFormat: noThousandsCommaDecimal }),
        '1,2k'
      )
      assert.strictEqual(
        formatCompactNumber(1000000000000000, {
          numberFormat: noThousandsDotDecimal,
        }),
        '1000t'
      )
    })
  })
})
