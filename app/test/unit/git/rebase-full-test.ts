import { describe, it } from 'node:test'
import assert from 'node:assert'

import {
  rebase,
  abortRebase,
  getRebaseInternalState,
  RebaseResult,
} from '../../../src/lib/git/rebase'
import { getCommits, getBranches } from '../../../src/lib/git'
import { setupEmptyRepository } from '../../helpers/repositories'
import {
  makeCommit,
  createBranch,
  switchTo,
} from '../../helpers/repository-scaffolding'
import { Branch } from '../../../src/models/branch'
import { getStatusOrThrow } from '../../helpers/status'

async function findBranch(
  repo: import('../../../src/models/repository').Repository,
  name: string
): Promise<Branch> {
  const branches = await getBranches(repo)
  const branch = branches.find(b => b.name === name)
  if (!branch) {
    throw new Error(`Branch ${name} not found`)
  }
  return branch
}

describe('git/rebase', () => {
  describe('getRebaseInternalState', () => {
    it('returns null when no rebase is in progress', async t => {
      const repo = await setupEmptyRepository(t)
      await makeCommit(repo, {
        entries: [{ path: 'file.txt', contents: 'initial' }],
        commitMessage: 'initial commit',
      })

      const state = await getRebaseInternalState(repo)
      assert.equal(state, null)
    })
  })

  describe('rebase', () => {
    it('rebases a branch onto another', async t => {
      const repo = await setupEmptyRepository(t)

      // Create initial commit on master
      await makeCommit(repo, {
        entries: [{ path: 'base.txt', contents: 'base' }],
        commitMessage: 'initial commit',
      })

      // Create feature branch with a commit
      await createBranch(repo, 'feature', 'HEAD')
      await switchTo(repo, 'feature')
      await makeCommit(repo, {
        entries: [{ path: 'feature.txt', contents: 'feature work' }],
        commitMessage: 'feature commit',
      })

      // Add a commit on master
      await switchTo(repo, 'master')
      await makeCommit(repo, {
        entries: [{ path: 'master.txt', contents: 'master work' }],
        commitMessage: 'master commit',
      })

      // Switch to feature and rebase onto master
      await switchTo(repo, 'feature')
      const masterBranch = await findBranch(repo, 'master')
      const featureBranch = await findBranch(repo, 'feature')

      const result = await rebase(repo, masterBranch, featureBranch)
      assert.equal(result, RebaseResult.CompletedWithoutError)

      // Verify the feature branch now has all 3 commits
      const commits = await getCommits(repo, 'HEAD', 10)
      assert.equal(commits.length, 3)
    })

    it('detects conflicts during rebase', async t => {
      const repo = await setupEmptyRepository(t)

      // Create initial commit
      await makeCommit(repo, {
        entries: [{ path: 'conflict.txt', contents: 'base content' }],
        commitMessage: 'initial commit',
      })

      // Create feature branch with conflicting change
      await createBranch(repo, 'feature', 'HEAD')
      await switchTo(repo, 'feature')
      await makeCommit(repo, {
        entries: [{ path: 'conflict.txt', contents: 'feature version' }],
        commitMessage: 'feature change',
      })

      // Make conflicting change on master
      await switchTo(repo, 'master')
      await makeCommit(repo, {
        entries: [{ path: 'conflict.txt', contents: 'master version' }],
        commitMessage: 'master change',
      })

      // Try to rebase feature onto master
      await switchTo(repo, 'feature')
      const masterBranch = await findBranch(repo, 'master')
      const featureBranch = await findBranch(repo, 'feature')

      const result = await rebase(repo, masterBranch, featureBranch)
      assert.equal(result, RebaseResult.ConflictsEncountered)
    })
  })

  describe('abortRebase', () => {
    it('aborts an in-progress rebase', async t => {
      const repo = await setupEmptyRepository(t)

      // Set up conflicting branches
      await makeCommit(repo, {
        entries: [{ path: 'conflict.txt', contents: 'base' }],
        commitMessage: 'initial commit',
      })

      await createBranch(repo, 'feature', 'HEAD')
      await switchTo(repo, 'feature')
      await makeCommit(repo, {
        entries: [{ path: 'conflict.txt', contents: 'feature' }],
        commitMessage: 'feature change',
      })

      await switchTo(repo, 'master')
      await makeCommit(repo, {
        entries: [{ path: 'conflict.txt', contents: 'master' }],
        commitMessage: 'master change',
      })

      // Start rebase that will conflict
      await switchTo(repo, 'feature')
      const masterBranch = await findBranch(repo, 'master')
      const featureBranch = await findBranch(repo, 'feature')
      await rebase(repo, masterBranch, featureBranch)

      // Abort the rebase
      await abortRebase(repo)

      // Verify no rebase is in progress
      const state = await getRebaseInternalState(repo)
      assert.equal(state, null)

      // Verify we're back to the original feature commit
      const status = await getStatusOrThrow(repo)
      assert.equal(status.currentBranch, 'feature')
    })
  })
})
