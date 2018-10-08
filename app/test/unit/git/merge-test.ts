import { abortMerge, getMergeBase, getBranches } from '../../../src/lib/git'
import {
  setupEmptyRepository,
  setupFixtureRepository,
  setupConflictedRepo,
} from '../../helpers/repositories'
import { GitProcess } from 'dugite'
import { Repository } from '../../../src/models/repository'

describe('git/merge', () => {
  describe('getMergeBase', () => {
    it('returns the common ancestor of two branches', async () => {
      const path = await setupFixtureRepository('merge-base-test')
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
      expect(ref).toEqual('df0d73dc92ff496c6a61f10843d527b7461703f4')
    })

    it('returns null when the branches do not have a common ancestor', async () => {
      const repository = await setupEmptyRepository()

      const firstBranch = 'master'
      const secondBranch = 'gh-pages'

      // create the first commit
      await GitProcess.exec(
        ['commit', '--allow-empty', '-m', `first commit on master`],
        repository.path
      )

      // create a second branch that's orphaned from our current branch
      await GitProcess.exec(
        ['checkout', '--orphan', secondBranch],
        repository.path
      )

      // add a commit to this new branch
      await GitProcess.exec(
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
      expect(ref).toBeNull()
    })

    it('returns null when a ref cannot be found', async () => {
      const repository = await setupEmptyRepository()

      // create the first commit
      await GitProcess.exec(
        ['commit', '--allow-empty', '-m', `first commit on master`],
        repository.path
      )

      const ref = await getMergeBase(
        repository,
        'master',
        'origin/some-unknown-branch'
      )
      expect(ref).toBeNull()
    })
  })
  describe('abortMerge', () => {
    let repository: Repository
    const subject = () => abortMerge(repository)
    describe('when there is no in-progress merge', () => {
      beforeEach(async () => {
        repository = await setupEmptyRepository()
      })
      it('throws an error', async () => {
        await expect(subject()).rejects.toThrow(
          /There is no merge in progress, so there is nothing to abort/
        )
      })
    })
    describe('in the middle of resolving conflicts merge', () => {
      beforeEach(async () => {
        repository = await setupConflictedRepo()
      })
      it('aborts the merge', async () => {
        await expect(subject()).resolves.not.toThrow()
      })
    })
  })
})
