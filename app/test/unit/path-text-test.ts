import { expect } from 'chai'

import { truncateMid, truncatePath } from '../../src/ui/lib/path-text'

describe('PathText', () => {
  describe('truncateMid', () => {
    it('doesn\'t truncate if the string already fits', () => {
      expect(truncateMid('foo', 3)).to.equal('foo')
      expect(truncateMid('foo', 10)).to.equal('foo')
    })

    it('returns an empty string if length is zero or less', () => {
      expect(truncateMid('foo', 0)).to.equal('')
      expect(truncateMid('foo', -10)).to.equal('')
    })

    it('returns an ellipsis if length is one', () => {
      expect(truncateMid('foo', 1)).to.equal('…')
    })

    it('truncates to the exact length given', () => {
      expect(truncateMid('foo bar', 6)).to.equal('fo…bar')
      expect(truncateMid('foo bar', 5)).to.equal('fo…ar')
      expect(truncateMid('foo bar', 3)).to.equal('f…r')
    })
  })

    describe('truncatePath', () => {
    it('doesn\'t truncate if the string already fits', () => {
      expect(truncatePath('foo', 3)).to.equal('foo')
      expect(truncatePath('foo', 10)).to.equal('foo')
    })

    it('returns an empty string if length is zero or less', () => {
      expect(truncatePath('foo', 0)).to.equal('')
      expect(truncatePath('foo', -10)).to.equal('')
    })

    it('returns an ellipsis if length is one', () => {
      expect(truncatePath('foo', 1)).to.equal('…')
    })

    it('truncates to the exact length given', () => {
      expect(truncatePath('foo bar', 6)).to.equal('fo…bar')
      expect(truncatePath('foo bar', 5)).to.equal('fo…ar')
      expect(truncatePath('foo bar', 3)).to.equal('f…r')

      expect(truncatePath('foo\\foo bar', 6)).to.equal('fo…bar')
      expect(truncatePath('foo\\foo bar', 9)).to.equal('…\\foo bar')
    })

    it('favors truncation of directory components over file names', () => {
      expect(truncatePath('alfa\\bravo\\charlie\\delta.txt', 25)).to.equal('alfa\\bravo\\cha…\\delta.txt')
      expect(truncatePath('alfa\\bravo\\charlie\\delta.txt', 22)).to.equal('alfa\\bravo\\…\\delta.txt')
      expect(truncatePath('alfa\\bravo\\charlie\\delta.txt', 17)).to.equal('alfa\\b…\\delta.txt')
    })
  })
})
