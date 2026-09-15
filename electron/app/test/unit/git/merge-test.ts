import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  abortMerge,
  getMergeBase,
  getBranches,
  merge,
  MergeResult,
} from '../../../src/lib/git'
import {
  setupEmptyRepository,
  setupFixtureRepository,
  setupConflictedRepo,
} from '../../helpers/repositories'
import { exec } from 'dugite'
import { Repository } from '../../../src/models/repository'

describe('git/merge', () => {
  describe('merge', () => {
    describe('and is successful', () => {
      it('returns MergeResult.Success', async t => {
        const path = await setupFixtureRepository(t, 'merge-base-test')
        const repository = new Repository(path, -1, null, false)
        assert.equal(await merge(repository, 'dev'), MergeResult.Success)
      })
    })
    describe('and is a noop', () => {
      it('returns MergeResult.AlreadyUpToDate', async t => {
        const path = await setupFixtureRepository(t, 'merge-base-test')
        const repository = new Repository(path, -1, null, false)
        await merge(repository, 'dev')
        assert.equal(
          await merge(repository, 'dev'),
          MergeResult.AlreadyUpToDate
        )
      })
    })
  })

  describe('getMergeBase', () => {
    it('returns the common ancestor of two branches', async t => {
      const path = await setupFixtureRepository(t, 'merge-base-test')
      const repository = new Repository(path, -1, null, false)

      const allBranches = await getBranches(repository)
      const first = allBranches.find(f => f.nameWithoutRemote === 'master')
      if (first == null) {
        throw new Error('Unable to find branch: master')
      }

      const second = allBranches.find(f => f.nameWithoutRemote === 'dev')
      if (second == null) {
        throw new Error('Unable to find branch: dev')
      }

      const ref = await getMergeBase(repository, first.tip.sha, second.tip.sha)
      assert.equal(ref, 'df0d73dc92ff496c6a61f10843d527b7461703f4')
    })

    it('returns null when the branches do not have a common ancestor', async t => {
      const repository = await setupEmptyRepository(t)

      const firstBranch = 'master'
      const secondBranch = 'gh-pages'

      // create the first commit
      await exec(
        ['commit', '--allow-empty', '-m', `first commit on master`],
        repository.path
      )

      // create a second branch that's orphaned from our current branch
      await exec(['checkout', '--orphan', secondBranch], repository.path)

      // add a commit to this new branch
      await exec(
        ['commit', '--allow-empty', '-m', `first commit on gh-pages`],
        repository.path
      )

      const allBranches = await getBranches(repository)
      const first = allBranches.find(f => f.nameWithoutRemote === firstBranch)
      if (first == null) {
        throw new Error(`Unable to find branch ${firstBranch}`)
      }

      const second = allBranches.find(f => f.nameWithoutRemote === secondBranch)
      if (second == null) {
        throw new Error(`Unable to find branch ${secondBranch}`)
      }

      const ref = await getMergeBase(repository, first.tip.sha, second.tip.sha)
      assert(ref === null)
    })

    it('returns null when a ref cannot be found', async t => {
      const repository = await setupEmptyRepository(t)

      // create the first commit
      await exec(
        ['commit', '--allow-empty', '-m', `first commit on master`],
        repository.path
      )

      const ref = await getMergeBase(
        repository,
        'master',
        'origin/some-unknown-branch'
      )
      assert(ref === null)
    })
  })
  describe('abortMerge', () => {
    describe('when there is no in-progress merge', () => {
      it('throws an error', async t => {
        const repository = await setupEmptyRepository(t)
        await assert.rejects(
          () => abortMerge(repository),
          /There is no merge in progress, so there is nothing to abort/
        )
      })
    })
    describe('in the middle of resolving conflicts merge', () => {
      it('aborts the merge', async t => {
        const repository = await setupConflictedRepo(t)
        await assert.doesNotReject(() => abortMerge(repository))
      })
    })
  })
})
