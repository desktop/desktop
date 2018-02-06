import { expect } from 'chai'
import { GitLFSProgressParser } from '../../../src/lib/progress/lfs'

describe('GitLFSProgressParser', () => {
  describe('#parse', () => {
    let parser: GitLFSProgressParser

    beforeEach(() => {
      parser = new GitLFSProgressParser()
    })

    it('understands valid lines', () => {
      const result = parser.parse('download 1/2 5/300 my cool image.jpg')
      expect(result.kind).to.equal('progress')
    })

    it("ignores lines it doesn't understand", () => {
      const result = parser.parse('All this happened, more or less.')
      expect(result.kind).to.equal('context')
    })
  })
})
