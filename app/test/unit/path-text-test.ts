import { expect } from 'chai'

import { truncateMid } from '../../src/ui/lib/path-text'

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
})
