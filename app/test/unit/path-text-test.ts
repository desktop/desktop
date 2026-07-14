import { describe, it } from 'node:test'
import assert from 'node:assert'
import { truncateMid, truncatePath, extract } from '../../src/ui/lib/path-text'

describe('PathText', () => {
  describe('truncateMid', () => {
    it("doesn't truncate if the string already fits", () => {
      assert.equal(truncateMid('foo', 3), 'foo')
      assert.equal(truncateMid('foo', 10), 'foo')
    })

    it('returns an empty string if length is zero or less', () => {
      assert.equal(truncateMid('foo', 0), '')
      assert.equal(truncateMid('foo', -10), '')
    })

    it('returns an ellipsis if length is one', () => {
      assert.equal(truncateMid('foo', 1), '…')
    })

    it('truncates to the exact length given', () => {
      assert.equal(truncateMid('foo bar', 6), 'fo…bar')
      assert.equal(truncateMid('foo bar', 5), 'fo…ar')
      assert.equal(truncateMid('foo bar', 3), 'f…r')
    })
  })

  describe('truncatePath', () => {
    it("doesn't truncate if the string already fits", () => {
      assert.equal(truncatePath('foo', 3), 'foo')
      assert.equal(truncatePath('foo', 10), 'foo')
    })

    it('returns an empty string if length is zero or less', () => {
      assert.equal(truncatePath('foo', 0), '')
      assert.equal(truncatePath('foo', -10), '')
    })

    it('returns an ellipsis if length is one', () => {
      assert.equal(truncatePath('foo', 1), '…')
    })

    it('truncates to the exact length given', () => {
      assert.equal(truncatePath('foo bar', 6), 'fo…bar')
      assert.equal(truncatePath('foo bar', 5), 'fo…ar')
      assert.equal(truncatePath('foo bar', 3), 'f…r')

      if (__WIN32__) {
        assert.equal(truncatePath('foo\\foo bar', 6), 'fo…bar')
        assert.equal(truncatePath('foo\\foo bar', 9), '…\\foo bar')
      } else {
        assert.equal(truncatePath('foo/foo bar', 6), 'fo…bar')
        assert.equal(truncatePath('foo/foo bar', 9), '…/foo bar')
      }
    })

    it('favors truncation of directory components over file names', () => {
      if (__WIN32__) {
        assert.equal(
          truncatePath('alfa\\bravo\\charlie\\delta.txt', 25),
          'alfa\\bravo\\cha…\\delta.txt'
        )
        assert.equal(
          truncatePath('alfa\\bravo\\charlie\\delta.txt', 22),
          'alfa\\bravo\\…\\delta.txt'
        )
        assert.equal(
          truncatePath('alfa\\bravo\\charlie\\delta.txt', 17),
          'alfa\\b…\\delta.txt'
        )
      } else {
        assert.equal(
          truncatePath('alfa/bravo/charlie/delta.txt', 25),
          'alfa/bravo/cha…/delta.txt'
        )
        assert.equal(
          truncatePath('alfa/bravo/charlie/delta.txt', 22),
          'alfa/bravo/…/delta.txt'
        )
        assert.equal(
          truncatePath('alfa/bravo/charlie/delta.txt', 17),
          'alfa/b…/delta.txt'
        )
      }
    })
  })

  describe('extract', () => {
    it('converts untracked submodule correctly', () => {
      const { normalizedFileName, normalizedDirectory } = extract(
        __WIN32__ ? 'some\\submodule\\path\\' : 'some/submodule/path/'
      )
      assert.equal(normalizedFileName, 'path')
      assert.equal(
        normalizedDirectory,
        __WIN32__ ? 'some\\submodule\\' : 'some/submodule/'
      )
    })

    it('converts tracked submodule correctly', () => {
      const { normalizedFileName, normalizedDirectory } = extract(
        __WIN32__ ? 'some\\submodule\\path' : 'some/submodule/path'
      )
      assert.equal(normalizedFileName, 'path')
      assert.equal(
        normalizedDirectory,
        __WIN32__ ? 'some\\submodule\\' : 'some/submodule/'
      )
    })

    it('converts file path correctly', () => {
      const { normalizedFileName, normalizedDirectory } = extract(
        __WIN32__ ? 'some\\repository\\path.tsx' : 'some/repository/path.tsx'
      )
      assert.equal(normalizedFileName, 'path.tsx')
      assert.equal(
        normalizedDirectory,
        __WIN32__ ? 'some\\repository\\' : 'some/repository/'
      )
    })
  })
})
