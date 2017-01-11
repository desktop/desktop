import { expect, use as chaiUse } from 'chai'
import { setupEmptyRepository, setupFixtureRepository } from '../../fixture-helper'
import { getTip } from '../../../src/lib/git/branch'
import { Repository } from '../../../src/models/repository'

chaiUse(require('chai-datetime'))

describe('git/branch', () => {
  describe('tip', () => {
    it('returns unborn for new repository', async () => {
      const repository = await setupEmptyRepository()

      const tip = await getTip(repository)

      expect(tip!.isUnborn).to.be.true
      expect(tip!.isDetachedHead).to.be.false
      expect(tip!.currentSha).to.be.null
      expect(tip!.branch).to.be.null
    })

    it('returns detached for arbitrary checkout', async () => {
      const path = await setupFixtureRepository('detached-head')
      const repository = new Repository(path, -1, null)

      const tip = await getTip(repository)

      expect(tip!.isUnborn).to.be.false
      expect(tip!.isDetachedHead).to.be.true
      expect(tip!.currentSha).to.equal('2acb028231d408aaa865f9538b1c89de5a2b9da8')
      expect(tip!.branch).to.be.null
    })

    it('returns current branch when on a valid HEAD', async () => {
      const path = await setupFixtureRepository('repo-with-many-refs')
      const repository = new Repository(path, -1, null)

      const tip = await getTip(repository)

      expect(tip!.isUnborn).to.be.false
      expect(tip!.isDetachedHead).to.be.false
      expect(tip!.currentSha).to.equal('dfa96676b65e1c0ed43ca25492252a5e384c8efd')
      expect(tip!.branch).to.not.be.null
      expect(tip!.branch!.name).to.equal('commit-with-long-description')
    })
  })
})
