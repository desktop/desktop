import { describe, it } from 'node:test'
import assert from 'node:assert'
import { formatBytes } from '../../src/ui/lib/bytes'

describe('formatBytes', () => {
  it('rounds to the desired number decimals', () => {
    assert.equal(formatBytes(1342177280, 2), '1.25 GiB')
    assert.equal(formatBytes(1342177280, 1), '1.3 GiB')
    assert.equal(formatBytes(1342177280, 0), '1 GiB')

    assert.equal(formatBytes(1879048192, 2), '1.75 GiB')
    assert.equal(formatBytes(1879048192, 1), '1.8 GiB')
    assert.equal(formatBytes(1879048192, 0), '2 GiB')
  })

  it('uses the correct units', () => {
    assert.equal(formatBytes(1023), '1023 B')
    assert.equal(formatBytes(1024), '1 KiB')

    // N.B this codifies the current behavior, I personally
    // wouldn't object to formatBytes(1048575) returning 1 MiB
    assert.equal(formatBytes(1048575, 3), '1023.999 KiB')
    assert.equal(formatBytes(1048575), '1024 KiB')
    assert.equal(formatBytes(1048576), '1 MiB')

    assert.equal(formatBytes(1073741823), '1024 MiB')
    assert.equal(formatBytes(1073741824), '1 GiB')

    assert.equal(formatBytes(1099511627775), '1024 GiB')
    assert.equal(formatBytes(1099511627776), '1 TiB')
  })

  it("doesn't attempt to format NaN", () => {
    assert.equal(formatBytes(NaN), 'NaN')
  })

  it("doesn't attempt to format Infinity", () => {
    assert.equal(formatBytes(Infinity), 'Infinity')
  })
})
