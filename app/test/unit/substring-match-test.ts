import { describe, it } from 'node:test'
import assert from 'node:assert'
import { getSubstringMatchIndices } from '../../src/lib/substring-match'

describe('getSubstringMatchIndices', () => {
  it('returns nothing for an empty query', () => {
    assert.deepStrictEqual(getSubstringMatchIndices('fix the thing', ''), [])
    assert.deepStrictEqual(getSubstringMatchIndices('fix the thing', '   '), [])
  })

  it('returns nothing when the text does not hold the query', () => {
    assert.deepStrictEqual(getSubstringMatchIndices('fix the thing', 'zzz'), [])
  })

  it('covers every character of a match', () => {
    assert.deepStrictEqual(getSubstringMatchIndices('fix it', 'fix'), [0, 1, 2])
  })

  it('ignores case in both directions', () => {
    assert.deepStrictEqual(getSubstringMatchIndices('FIX it', 'fix'), [0, 1, 2])
    assert.deepStrictEqual(getSubstringMatchIndices('fix it', 'FIX'), [0, 1, 2])
  })

  it('marks every occurrence, not only the first', () => {
    assert.deepStrictEqual(
      getSubstringMatchIndices('aba aba', 'aba'),
      [0, 1, 2, 4, 5, 6]
    )
  })

  it('does not overlap a repeating needle', () => {
    // "aaaa" holds "aa" twice without reusing a character.
    assert.deepStrictEqual(getSubstringMatchIndices('aaaa', 'aa'), [0, 1, 2, 3])
  })

  it('treats the query as a literal, not a pattern', () => {
    assert.deepStrictEqual(getSubstringMatchIndices('a.c', '.'), [1])
    assert.deepStrictEqual(getSubstringMatchIndices('abc', '.'), [])
  })
})
