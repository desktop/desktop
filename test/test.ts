import * as chai from 'chai'
const expect = chai.expect

describe('Array', () => {
  describe('#indexOf()', () => {
    it('should return -1 when the value is not present', () => {
      expect([1, 2, 3].indexOf(5)).to.equal(-1)
      expect([1, 2, 3].indexOf(0)).to.equal(-1)
    })

    it('should return the index when the value is present', () => {
      expect([1, 2, 3].indexOf(2)).to.equal(1)
      expect([1, 2, 3].indexOf(3)).to.equal(2)
    })
  })
})
