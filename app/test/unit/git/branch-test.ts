import { expect, use as chaiUse } from 'chai'
import { setupEmptyRepository, setupFixtureRepository } from '../../fixture-helper'
import { getTip } from '../../../src/lib/git'
import { Repository } from '../../../src/models/repository'
import { TipState, IDetachedHead, IValidBranch } from '../../../src/models/tip'

chaiUse(require('chai-datetime'))

describe('git/branch', () => {
  describe('tip', () => {
    it('returns unborn for new repository', async () => {
      const repository = await setupEmptyRepository()

      const result = await getTip(repository)
      const tip = result!

      expect(tip.kind).to.equal(TipState.Unborn)
    })

    it('returns detached for arbitrary checkout', async () => {
      const path = await setupFixtureRepository('detached-head')
      const repository = new Repository(path, -1, null)

      const result = await getTip(repository)
      const tip = result!

      expect(tip.kind).to.equal(TipState.Detached)
      const detached = tip as IDetachedHead
      expect(detached.currentSha).to.equal('2acb028231d408aaa865f9538b1c89de5a2b9da8')
    })

    it('returns current branch when on a valid HEAD', async () => {
      const path = await setupFixtureRepository('repo-with-many-refs')
      const repository = new Repository(path, -1, null)

      const result = await getTip(repository)
      const tip = result!

      expect(tip.kind).to.equal(TipState.Valid)
      const onBranch = tip as IValidBranch
      expect(onBranch.branch.name).to.equal('commit-with-long-description')
      expect(onBranch.branch.tip.sha).to.equal('dfa96676b65e1c0ed43ca25492252a5e384c8efd')
    })

    it('returns non-origin remote', async () => {
      const path = await setupFixtureRepository('repo-with-multiple-remotes')
      const repository = new Repository(path, -1, null)

      const result = await getTip(repository)
      const tip = result!

      expect(tip.kind).to.equal(TipState.Valid)
      const valid = tip as IValidBranch
      expect(valid.branch.remote).to.equal('bassoon')
    })
  })

  describe('upstreamWithoutRemote', () => {
    it('returns the upstream name without the remote prefix', async () => {
      const path = await setupFixtureRepository('repo-with-multiple-remotes')
      const repository = new Repository(path, -1, null)

      const result = await getTip(repository)
      const tip = result!

      expect(tip.kind).to.equal(TipState.Valid)

      const valid = tip as IValidBranch
      expect(valid.branch.remote).to.equal('bassoon')
      expect(valid.branch.upstream).to.equal('bassoon/master')
      expect(valid.branch.upstreamWithoutRemote).to.equal('master')
    })
  })
})
