import * as chai from 'chai'
const expect = chai.expect

import { CloneProgressParser } from '../../src/lib/progress'

describe('CloneProgressParser', () => {
  describe('#parse', () => {
    let parser: CloneProgressParser = new CloneProgressParser()

    afterEach(() => { parser = new CloneProgressParser() })

    it('understands receiving object', () => {
      expect(parser.parse('Receiving objects:  17% (4808/28282), 3.30 MiB | 1.29 MiB/s')).not.to.be.null
    })

    it('understands resolving deltas', () => {
      expect(parser.parse('Resolving deltas:  89% (18063/20263)')).not.to.be.null
    })

    it('understands checking out files', () => {
      expect(parser.parse('Checking out files: 100% (579/579)')).not.to.be.null
    })

    it('ignores wrong order', () => {
      const finalProgress = parser.parse('Checking out files: 100% (579/579)')
      const earlyProgress = parser.parse('Receiving objects:   1% (283/28282)')

      expect(earlyProgress).to.be.null
      expect(finalProgress).to.not.be.null
    })

    it('ignores lines it doesn\'t understand', () => {
      expect(parser.parse('Counting objects: 28282, done.')).to.be.null
    })
  })
})
