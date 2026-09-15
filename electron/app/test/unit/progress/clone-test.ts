import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert'
import { CloneProgressParser } from '../../../src/lib/progress'

describe('CloneProgressParser', () => {
  describe('#parse', () => {
    let parser: CloneProgressParser = new CloneProgressParser()

    afterEach(() => {
      parser = new CloneProgressParser()
    })

    it('understands receiving object', () => {
      assert(
        parser.parse(
          'Receiving objects:  17% (4808/28282), 3.30 MiB | 1.29 MiB/s'
        ) !== null
      )
    })

    it('understands resolving deltas', () => {
      assert(parser.parse('Resolving deltas:  89% (18063/20263)') !== null)
    })

    it('understands checking out files', () => {
      assert(parser.parse('Checking out files: 100% (579/579)') !== null)
    })

    it('understands remote compression', () => {
      assert(parser.parse('remote: Compressing objects:  45% (10/22)') !== null)
    })

    it('understands relative weights', () => {
      const compressing = parser.parse(
        'remote: Compressing objects:  45% (10/22)'
      )
      assert.equal(compressing.kind, 'progress')
      assert.equal(compressing.percent, (10 / 22) * 0.1)

      const receiving = parser.parse(
        'Receiving objects:  17% (4808/28282), 3.30 MiB | 1.29 MiB/s'
      )
      assert.equal(receiving.kind, 'progress')
      assert.equal(receiving.percent, 0.1 + (4808 / 28282) * 0.6)

      const resolving = parser.parse('Resolving deltas:  89% (18063/20263)')
      assert.equal(resolving.kind, 'progress')
      assert.equal(resolving.percent, 0.7 + (18063 / 20263) * 0.1)

      const checkingOut = parser.parse('Checking out files: 100% (579/579)')
      assert.equal(checkingOut.kind, 'progress')
      assert.equal(checkingOut.percent, 0.8 + (579 / 579) * 0.2)
    })

    it('ignores wrong order', () => {
      const finalProgress = parser.parse('Checking out files: 100% (579/579)')
      const earlyProgress = parser.parse('Receiving objects:   1% (283/28282)')

      assert.equal(earlyProgress.kind, 'context')
      assert.equal(finalProgress.kind, 'progress')
    })

    it("ignores lines it doesn't understand", () => {
      assert.equal(
        parser.parse('Counting objects: 28282, done.').kind,
        'context'
      )
    })
  })
})
