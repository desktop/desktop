import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { GitLFSProgressParser } from '../../../src/lib/progress/lfs'

describe('GitLFSProgressParser', () => {
  describe('#parse', () => {
    let parser: GitLFSProgressParser

    beforeEach(() => {
      parser = new GitLFSProgressParser()
    })

    it('understands valid lines', () => {
      const result = parser.parse('download 1/2 5/300 my cool image.jpg')
      assert.equal(result.kind, 'progress')
    })

    it("ignores lines it doesn't understand", () => {
      const result = parser.parse('All this happened, more or less.')
      assert.equal(result.kind, 'context')
    })
  })
})
