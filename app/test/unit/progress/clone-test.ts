import { expect } from 'chai'
import { CloneProgressParser } from '../../../src/lib/progress'

describe('CloneProgressParser', () => {
  describe('#parse', () => {
    let parser: CloneProgressParser = new CloneProgressParser()

    afterEach(() => {
      parser = new CloneProgressParser()
    })

    it('understands receiving object', () => {
      expect(
        parser.parse(
          'Receiving objects:  17% (4808/28282), 3.30 MiB | 1.29 MiB/s'
        )
      ).not.to.be.null
    })

    it('understands resolving deltas', () => {
      expect(parser.parse('Resolving deltas:  89% (18063/20263)')).not.to.be
        .null
    })

    it('understands checking out files', () => {
      expect(parser.parse('Checking out files: 100% (579/579)')).not.to.be.null
    })

    it('understands remote compression', () => {
      expect(parser.parse('remote: Compressing objects:  45% (10/22)')).not.to
        .be.null
    })

    it('understands relative weights', () => {
      const compressing = parser.parse(
        'remote: Compressing objects:  45% (10/22)'
      )
      expect(compressing.kind).to.equal('progress')
      expect(compressing.percent).to.be.closeTo((10 / 22) * 0.1, 0.01)

      const receiving = parser.parse(
        'Receiving objects:  17% (4808/28282), 3.30 MiB | 1.29 MiB/s'
      )
      expect(receiving.kind).to.equal('progress')
      expect(receiving.percent).to.be.closeTo(0.1 + (4808 / 28282) * 0.6, 0.01)

      const resolving = parser.parse('Resolving deltas:  89% (18063/20263)')
      expect(resolving.kind).to.equal('progress')
      expect(resolving.percent).to.be.closeTo(0.7 + (18063 / 20263) * 0.1, 0.01)

      const checkingOut = parser.parse('Checking out files: 100% (579/579)')
      expect(checkingOut.kind).to.equal('progress')
      expect(checkingOut.percent).to.be.closeTo(0.8 + (579 / 579) * 0.2, 0.01)
    })

    it('ignores wrong order', () => {
      const finalProgress = parser.parse('Checking out files: 100% (579/579)')
      const earlyProgress = parser.parse('Receiving objects:   1% (283/28282)')

      expect(earlyProgress.kind).to.equal('context')
      expect(finalProgress.kind).to.equal('progress')
    })

    it("ignores lines it doesn't understand", () => {
      expect(parser.parse('Counting objects: 28282, done.').kind).to.equal(
        'context'
      )
    })
  })
})
