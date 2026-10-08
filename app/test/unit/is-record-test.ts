import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isRecord } from '../../src/lib/is-record'

describe('isRecord', () => {
  it('rejects null, primitives, functions, and arrays', () => {
    for (const value of [
      null,
      undefined,
      '',
      'text',
      0,
      1,
      false,
      true,
      Symbol('key'),
      () => ({}),
      [],
      [{ key: 'value' }],
    ]) {
      assert.equal(isRecord(value), false)
    }
  })

  it('accepts non-array objects without restricting their prototype', () => {
    for (const value of [
      {},
      { key: 'value' },
      Object.create(null),
      new Date(0),
    ]) {
      assert.equal(isRecord(value), true)
    }
  })

  it('narrows unknown values so their properties can be checked', () => {
    const value: unknown = { key: 'value' }
    assert.ok(isRecord(value))
    const property: unknown = value.key
    assert.equal(property, 'value')
  })
})
