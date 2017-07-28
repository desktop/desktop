import { expect } from 'chai'
import { GitLFSProgressParser } from '../../../src/lib/progress/lfs'

describe.only('GitLFSProgressParser', () => {
  describe('#parse', () => {
    let parser: GitLFSProgressParser

    beforeEach(() => {
      parser = new GitLFSProgressParser()
    })

    it('understands valid lines', () => {
      let result = parser.parse('download 1/2 5/300 my cool image.jpg')
      expect(result.kind).to.equal('progress')
      expect(result.percent).to.be.closeTo(5 / 300, 0.01)

      result = parser.parse('checkout 2/100 20/500 funny.gif')
      expect(result.kind).to.equal('progress')
      expect(result.percent).to.be.closeTo(20 / 500, 0.01)
    })

    it("ignores lines it doesn't understand", () => {
      const result = parser.parse('All this happened, more or less.')
      expect(result.kind).to.equal('context')
    })
  })
})
