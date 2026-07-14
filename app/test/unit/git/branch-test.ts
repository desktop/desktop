import { describe, it } from 'node:test'
import assert from 'node:assert'
import { shell } from '../../helpers/test-app-shell'
import {
  setupEmptyRepository,
  setupFixtureRepository,
  setupLocalForkOfRepository,
} from '../../helpers/repositories'

import { Repository } from '../../../src/models/repository'
import {
  TipState,
  IDetachedHead,
  IValidBranch,
  IUnbornRepository,
} from '../../../src/models/tip'
import { GitStore } from '../../../src/lib/stores'
import { exec } from 'dugite'
import {
  getBranchesPointedAt,
  createBranch,
  getBranches,
  git,
  checkoutBranch,
  deleteLocalBranch,
  deleteRemoteBranch,
} from '../../../src/lib/git'
import { assertNonNullable } from '../../../src/lib/fatal-error'
import { TestStatsStore } from '../../helpers/test-stats-store'

describe('git/branch', () => {
  describe('tip', () => {
    it('returns unborn for new repository', async t => {
      const repository = await setupEmptyRepository(t)

      const store = new GitStore(repository, shell, new TestStatsStore())
      await store.loadStatus()
      const tip = store.tip

      assert.equal(tip.kind, TipState.Unborn)
      const unborn = tip as IUnbornRepository
      assert.equal(unborn.ref, 'master')
    })

    it('returns correct ref if checkout occurs', async t => {
      const repository = await setupEmptyRepository(t)

      await exec(['checkout', '-b', 'not-master'], repository.path)

      const store = new GitStore(repository, shell, new TestStatsStore())
      await store.loadStatus()
      const tip = store.tip

      assert.equal(tip.kind, TipState.Unborn)
      const unborn = tip as IUnbornRepository
      assert.equal(unborn.ref, 'not-master')
    })

    it('returns detached for arbitrary checkout', async t => {
      const path = await setupFixtureRepository(t, 'detached-head')
      const repository = new Repository(path, -1, null, false)

      const store = new GitStore(repository, shell, new TestStatsStore())
      await store.loadStatus()
      const tip = store.tip

      assert.equal(tip.kind, TipState.Detached)
      const detached = tip as IDetachedHead
      assert.equal(
        detached.currentSha,
        '2acb028231d408aaa865f9538b1c89de5a2b9da8'
      )
    })

    it('returns current branch when on a valid HEAD', async t => {
      const path = await setupFixtureRepository(t, 'repo-with-many-refs')
      const repository = new Repository(path, -1, null, false)

      const store = new GitStore(repository, shell, new TestStatsStore())
      await store.loadStatus()
      const tip = store.tip

      assert.equal(tip.kind, TipState.Valid)
      const onBranch = tip as IValidBranch
      assert.equal(onBranch.branch.name, 'commit-with-long-description')
      assert.equal(
        onBranch.branch.tip.sha,
        'dfa96676b65e1c0ed43ca25492252a5e384c8efd'
      )
    })

    it('returns non-origin remote', async t => {
      const path = await setupFixtureRepository(t, 'repo-with-multiple-remotes')
      const repository = new Repository(path, -1, null, false)

      const store = new GitStore(repository, shell, new TestStatsStore())
      await store.loadStatus()
      const tip = store.tip

      assert.equal(tip.kind, TipState.Valid)
      const valid = tip as IValidBranch
      assert.equal(valid.branch.upstreamRemoteName, 'bassoon')
    })
  })

  describe('upstreamWithoutRemote', () => {
    it('returns the upstream name without the remote prefix', async t => {
      const path = await setupFixtureRepository(t, 'repo-with-multiple-remotes')
      const repository = new Repository(path, -1, null, false)

      const store = new GitStore(repository, shell, new TestStatsStore())
      await store.loadStatus()
      const tip = store.tip

      assert.equal(tip.kind, TipState.Valid)

      const valid = tip as IValidBranch
      assert.equal(valid.branch.upstreamRemoteName, 'bassoon')
      assert.equal(valid.branch.upstream, 'bassoon/master')
      assert.equal(valid.branch.upstreamWithoutRemote, 'master')
    })
  })

  describe('getBranchesPointedAt', () => {
    describe('in a local repo', () => {
      it('finds one branch name', async t => {
        const path = await setupFixtureRepository(t, 'test-repo')
        const repository = new Repository(path, -1, null, false)

        const branches = await getBranchesPointedAt(repository, 'HEAD')
        assert(branches !== null)
        assert.equal(branches.length, 1)
        assert.equal(branches[0], 'master')
      })

      it('finds no branch names', async t => {
        const path = await setupFixtureRepository(t, 'test-repo')
        const repository = new Repository(path, -1, null, false)

        const branches = await getBranchesPointedAt(repository, 'HEAD^')
        assert(branches !== null)
        assert.equal(branches.length, 0)
      })

      it('returns null on a malformed committish', async t => {
        const path = await setupFixtureRepository(t, 'test-repo')
        const repository = new Repository(path, -1, null, false)

        const branches = await getBranchesPointedAt(repository, 'MERGE_HEAD')
        assert(branches === null)
      })
    })

    describe('in a repo with identical branches', () => {
      it('finds multiple branch names', async t => {
        const path = await setupFixtureRepository(
          t,
          'repo-with-multiple-remotes'
        )
        const repository = new Repository(path, -1, null, false)
        await createBranch(repository, 'other-branch', null)

        const branches = await getBranchesPointedAt(repository, 'HEAD')
        assert(branches !== null)
        assert.equal(branches.length, 2)
        assert(branches.includes('other-branch'))
        assert(branches.includes('master'))
      })
    })
  })

  describe('deleteLocalBranch', () => {
    it('deletes local branches', async t => {
      const path = await setupFixtureRepository(t, 'test-repo')
      const repository = new Repository(path, -1, null, false)

      const name = 'test-branch'
      await createBranch(repository, name, null)
      const [branch] = await getBranches(repository, `refs/heads/${name}`)
      assertNonNullable(branch, `Could not create branch ${name}`)

      const ref = `refs/heads/${name}`

      assert(branch !== null)
      assert.equal((await getBranches(repository, ref)).length, 1)

      await deleteLocalBranch(repository, branch.name)

      assert.equal((await getBranches(repository, ref)).length, 0)
    })
  })

  describe('deleteRemoteBranch', () => {
    it('delete a local branches upstream branch', async t => {
      const path = await setupFixtureRepository(t, 'test-repo')
      const mockRemote = new Repository(path, -1, null, false)

      const name = 'test-branch'
      const branch = await createBranch(mockRemote, name, null)
      const localRef = `refs/heads/${name}`

      assert(branch !== null)

      const mockLocal = await setupLocalForkOfRepository(t, mockRemote)

      const remoteRef = `refs/remotes/origin/${name}`
      const [remoteBranch] = await getBranches(mockLocal, remoteRef)
      assert(remoteBranch !== undefined)

      await checkoutBranch(mockLocal, remoteBranch, null)
      await git(['checkout', '-'], mockLocal.path, 'checkoutPrevious')

      assert.equal((await getBranches(mockLocal, localRef)).length, 1)
      assert.equal((await getBranches(mockRemote, localRef)).length, 1)

      const [localBranch] = await getBranches(mockLocal, localRef)
      assert(localBranch !== undefined)
      assert(localBranch.upstreamRemoteName !== null)
      assert(localBranch.upstreamWithoutRemote !== null)

      await deleteRemoteBranch(
        mockLocal,
        { name: localBranch.upstreamRemoteName, url: '' },
        localBranch.upstreamWithoutRemote
      )

      assert.equal((await getBranches(mockLocal, localRef)).length, 1)
      assert.equal((await getBranches(mockLocal, remoteRef)).length, 0)
      assert.equal((await getBranches(mockRemote, localRef)).length, 0)
    })

    it('handles attempted delete of removed remote branch', async t => {
      const path = await setupFixtureRepository(t, 'test-repo')
      const mockRemote = new Repository(path, -1, null, false)

      const name = 'test-branch'
      const branch = await createBranch(mockRemote, name, null)
      const localRef = `refs/heads/${name}`

      assert(branch !== null)
      assert.equal((await getBranches(mockRemote, localRef)).length, 1)

      const mockLocal = await setupLocalForkOfRepository(t, mockRemote)

      const remoteRef = `refs/remotes/origin/${name}`
      const [remoteBranch] = await getBranches(mockLocal, remoteRef)
      assert(remoteBranch !== undefined)

      await checkoutBranch(mockLocal, remoteBranch, null)
      await git(['checkout', '-'], mockLocal.path, 'checkoutPrevious')

      assert.equal((await getBranches(mockLocal, localRef)).length, 1)
      assert.equal((await getBranches(mockRemote, localRef)).length, 1)

      const [upstreamBranch] = await getBranches(mockRemote, localRef)
      assert(upstreamBranch !== undefined)
      await deleteLocalBranch(mockRemote, upstreamBranch.name)
      assert.equal((await getBranches(mockRemote, localRef)).length, 0)

      const [localBranch] = await getBranches(mockLocal, localRef)
      assert(localBranch !== undefined)
      assert(localBranch.upstreamRemoteName !== null)
      assert(localBranch.upstreamWithoutRemote !== null)

      await deleteRemoteBranch(
        mockLocal,
        { name: localBranch.upstreamRemoteName, url: '' },
        localBranch.upstreamWithoutRemote
      )

      assert.equal((await getBranches(mockLocal, remoteRef)).length, 0)
      assert.equal((await getBranches(mockRemote, localRef)).length, 0)
    })
  })
})
