import { shell } from '../../helpers/test-app-shell'
import {
  setupEmptyRepository,
  setupFixtureRepository,
} from '../../helpers/repositories'

import { Repository } from '../../../src/models/repository'
import {
  TipState,
  IDetachedHead,
  IValidBranch,
  IUnbornRepository,
} from '../../../src/models/tip'
import { GitStore } from '../../../src/lib/stores'
import { GitProcess } from 'dugite'
import { getBranchesPointedAt, createBranch } from '../../../src/lib/git'

describe('git/branch', () => {
  describe('tip', () => {
    it('returns unborn for new repository', async () => {
      const repository = await setupEmptyRepository()

      const store = new GitStore(repository, shell)
      await store.loadStatus()
      const tip = store.tip

      expect(tip.kind).toEqual(TipState.Unborn)
      const unborn = tip as IUnbornRepository
      expect(unborn.ref).toEqual('master')
    })

    it('returns correct ref if checkout occurs', async () => {
      const repository = await setupEmptyRepository()

      await GitProcess.exec(['checkout', '-b', 'not-master'], repository.path)

      const store = new GitStore(repository, shell)
      await store.loadStatus()
      const tip = store.tip

      expect(tip.kind).toEqual(TipState.Unborn)
      const unborn = tip as IUnbornRepository
      expect(unborn.ref).toEqual('not-master')
    })

    it('returns detached for arbitrary checkout', async () => {
      const path = await setupFixtureRepository('detached-head')
      const repository = new Repository(path, -1, null, false)

      const store = new GitStore(repository, shell)
      await store.loadStatus()
      const tip = store.tip

      expect(tip.kind).toEqual(TipState.Detached)
      const detached = tip as IDetachedHead
      expect(detached.currentSha).toEqual(
        '2acb028231d408aaa865f9538b1c89de5a2b9da8'
      )
    })

    it('returns current branch when on a valid HEAD', async () => {
      const path = await setupFixtureRepository('repo-with-many-refs')
      const repository = new Repository(path, -1, null, false)

      const store = new GitStore(repository, shell)
      await store.loadStatus()
      const tip = store.tip

      expect(tip.kind).toEqual(TipState.Valid)
      const onBranch = tip as IValidBranch
      expect(onBranch.branch.name).toEqual('commit-with-long-description')
      expect(onBranch.branch.tip.sha).toEqual(
        'dfa96676b65e1c0ed43ca25492252a5e384c8efd'
      )
    })

    it('returns non-origin remote', async () => {
      const path = await setupFixtureRepository('repo-with-multiple-remotes')
      const repository = new Repository(path, -1, null, false)

      const store = new GitStore(repository, shell)
      await store.loadStatus()
      const tip = store.tip

      expect(tip.kind).toEqual(TipState.Valid)
      const valid = tip as IValidBranch
      expect(valid.branch.remote).toEqual('bassoon')
    })
  })

  describe('upstreamWithoutRemote', () => {
    it('returns the upstream name without the remote prefix', async () => {
      const path = await setupFixtureRepository('repo-with-multiple-remotes')
      const repository = new Repository(path, -1, null, false)

      const store = new GitStore(repository, shell)
      await store.loadStatus()
      const tip = store.tip

      expect(tip.kind).toEqual(TipState.Valid)

      const valid = tip as IValidBranch
      expect(valid.branch.remote).toEqual('bassoon')
      expect(valid.branch.upstream).toEqual('bassoon/master')
      expect(valid.branch.upstreamWithoutRemote).toEqual('master')
    })
  })

  describe('getBranchesPointedAt', () => {
    let repository: Repository
    describe('in a local repo', () => {
      beforeEach(async () => {
        const path = await setupFixtureRepository('test-repo')
        repository = new Repository(path, -1, null, false)
      })

      it('finds one branch name', async () => {
        const branches = await getBranchesPointedAt(repository, 'HEAD')
        expect(branches).toHaveLength(1)
        expect(branches![0]).toEqual('master')
      })

      it('finds no branch names', async () => {
        const branches = await getBranchesPointedAt(repository, 'HEAD^')
        expect(branches).toHaveLength(0)
      })

      it('returns null on a malformed committish', async () => {
        const branches = await getBranchesPointedAt(repository, 'MERGE_HEAD')
        expect(branches).toBeNull()
      })
    })

    describe('in a repo with identical branches', () => {
      beforeEach(async () => {
        const path = await setupFixtureRepository('repo-with-multiple-remotes')
        repository = new Repository(path, -1, null, false)
        await createBranch(repository, 'other-branch')
      })
      it('finds multiple branch names', async () => {
        const branches = await getBranchesPointedAt(repository, 'HEAD')
        expect(branches).toHaveLength(2)
        expect(branches).toContain('other-branch')
        expect(branches).toContain('master')
      })
    })
  })
})
