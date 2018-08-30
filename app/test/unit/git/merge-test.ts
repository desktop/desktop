import { expect } from 'chai'

import { getMergeBase, getBranches } from '../../../src/lib/git'
import { setupEmptyRepository } from '../../helpers/repositories'
import { GitProcess } from 'dugite'

describe('git/merge', () => {
  describe('getMergeBase', () => {
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
      expect(ref).is.null
    })
  })
})
