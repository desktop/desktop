import { truncateMid, truncatePath, extract } from '../../src/ui/lib/path-text'

describe('PathText', () => {
  describe('truncateMid', () => {
    it("doesn't truncate if the string already fits", () => {
      expect(truncateMid('foo', 3)).toBe('foo')
      expect(truncateMid('foo', 10)).toBe('foo')
    })

    it('returns an empty string if length is zero or less', () => {
      expect(truncateMid('foo', 0)).toBe('')
      expect(truncateMid('foo', -10)).toBe('')
    })

    it('returns an ellipsis if length is one', () => {
      expect(truncateMid('foo', 1)).toBe('…')
    })

    it('truncates to the exact length given', () => {
      expect(truncateMid('foo bar', 6)).toBe('fo…bar')
      expect(truncateMid('foo bar', 5)).toBe('fo…ar')
      expect(truncateMid('foo bar', 3)).toBe('f…r')
    })
  })

  describe('truncatePath', () => {
    it("doesn't truncate if the string already fits", () => {
      expect(truncatePath('foo', 3)).toBe('foo')
      expect(truncatePath('foo', 10)).toBe('foo')
    })

    it('returns an empty string if length is zero or less', () => {
      expect(truncatePath('foo', 0)).toBe('')
      expect(truncatePath('foo', -10)).toBe('')
    })

    it('returns an ellipsis if length is one', () => {
      expect(truncatePath('foo', 1)).toBe('…')
    })

    it('truncates to the exact length given', () => {
      expect(truncatePath('foo bar', 6)).toBe('fo…bar')
      expect(truncatePath('foo bar', 5)).toBe('fo…ar')
      expect(truncatePath('foo bar', 3)).toBe('f…r')

      if (__WIN32__) {
        expect(truncatePath('foo\\foo bar', 6)).toBe('fo…bar')
        expect(truncatePath('foo\\foo bar', 9)).toBe('…\\foo bar')
      } else {
        expect(truncatePath('foo/foo bar', 6)).toBe('fo…bar')
        expect(truncatePath('foo/foo bar', 9)).toBe('…/foo bar')
      }
    })

    it('favors truncation of directory components over file names', () => {
      if (__WIN32__) {
        expect(truncatePath('alfa\\bravo\\charlie\\delta.txt', 25)).toBe(
          'alfa\\bravo\\cha…\\delta.txt'
        )
        expect(truncatePath('alfa\\bravo\\charlie\\delta.txt', 22)).toBe(
          'alfa\\bravo\\…\\delta.txt'
        )
        expect(truncatePath('alfa\\bravo\\charlie\\delta.txt', 17)).toBe(
          'alfa\\b…\\delta.txt'
        )
      } else {
        expect(truncatePath('alfa/bravo/charlie/delta.txt', 25)).toBe(
          'alfa/bravo/cha…/delta.txt'
        )
        expect(truncatePath('alfa/bravo/charlie/delta.txt', 22)).toBe(
          'alfa/bravo/…/delta.txt'
        )
        expect(truncatePath('alfa/bravo/charlie/delta.txt', 17)).toBe(
          'alfa/b…/delta.txt'
        )
      }
    })
  })

  describe('extract', () => {
    it('converts untracked submodule correctly', () => {
      const { normalizedFileName, normalizedDirectory } = extract(
        'some/submodule/path/'
      )
      expect(normalizedFileName).toBe('path')
      expect(normalizedDirectory).toBe('some/submodule/')
    })

    it('converts tracked submodule correctly', () => {
      const { normalizedFileName, normalizedDirectory } = extract(
        'some/submodule/path'
      )
      expect(normalizedFileName).toBe('path')
      expect(normalizedDirectory).toBe('some/submodule/')
    })

    it('converts file path correctly', () => {
      const { normalizedFileName, normalizedDirectory } = extract(
        'some/repository/path.tsx'
      )
      expect(normalizedFileName).toBe('path.tsx')
      expect(normalizedDirectory).toBe('some/repository/')
    })
  })
})
