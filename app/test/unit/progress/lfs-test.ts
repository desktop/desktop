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

    for (const [direction, verb] of [
      ['clean', 'Cleaning'],
      ['download', 'Downloading'],
      ['upload', 'Uploading'],
      ['checkout', 'Checking out'],
      ['unknown', 'Downloading'],
    ]) {
      it(`labels ${direction} progress as ${verb}`, () => {
        assert.deepStrictEqual(
          parser.parse(`${direction} 1/1 262144/262144 my cool image.jpg`),
          {
            kind: 'progress',
            percent: 0,
            details: {
              title: `${verb} "my cool image.jpg"`,
              value: 262144,
              total: 262144,
              percent: 0,
              done: false,
              text: `${verb} my cool image.jpg (1 out of an estimated 1 completed, 256 KiB / 256 KiB)`,
            },
          }
        )
      })
    }

    it("ignores lines it doesn't understand", () => {
      const result = parser.parse('All this happened, more or less.')
      assert.equal(result.kind, 'context')
    })
  })
})
