import assert from 'node:assert'
import { describe, it } from 'node:test'

import { findLiteralMatches } from '../../../src/ui/diff/diff-search'

describe('findLiteralMatches', () => {
  it('finds non-overlapping matches case-insensitively', () => {
    assert.deepStrictEqual(
      [...findLiteralMatches('Foo foofood', 'foo')],
      [
        { index: 0, length: 3 },
        { index: 4, length: 3 },
        { index: 7, length: 3 },
      ]
    )
  })

  it('reports offsets from the original content', () => {
    assert.deepStrictEqual(
      [...findLiteralMatches('İfoo foo', 'foo')],
      [
        { index: 1, length: 3 },
        { index: 5, length: 3 },
      ]
    )
  })

  it('supports queries larger than the regular expression size limit', () => {
    const query = 'a'.repeat(32_768)
    assert.deepStrictEqual(
      [...findLiteralMatches(query, query)],
      [{ index: 0, length: query.length }]
    )
  })
})
