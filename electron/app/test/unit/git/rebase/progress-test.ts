import { describe, it, TestContext } from 'node:test'
import assert from 'node:assert'
import { continueRebase, getStatus } from '../../../../src/lib/git'
import {
  rebase,
  RebaseResult,
  getRebaseSnapshot,
} from '../../../../src/lib/git'
import { createRepository as createShortRebaseTest } from '../../../helpers/repository-builder-rebase-test'
import { createRepository as createLongRebaseTest } from '../../../helpers/repository-builder-long-rebase-test'
import { getStatusOrThrow } from '../../../helpers/status'
import { setupEmptyDirectory } from '../../../helpers/repositories'
import { getBranchOrError } from '../../../helpers/git'
import { IMultiCommitOperationProgress } from '../../../../src/models/progress'
import { isConflictedFile } from '../../../../src/lib/status'
import { ManualConflictResolution } from '../../../../src/models/manual-conflict-resolution'
import { Repository } from '../../../../src/models/repository'

const baseBranchName = 'base-branch'
const featureBranchName = 'this-is-a-feature'

describe('git/rebase', () => {
  describe('skips a normal repository', () => {
    it('returns null for rebase progress', async t => {
      const repository = await setupEmptyDirectory(t)
      const progress = await getRebaseSnapshot(repository)

      assert.equal(progress, null)
    })
  })

  describe('can parse progress', () => {
    const setup = async (t: TestContext) => {
      const repository = await createShortRebaseTest(
        t,
        baseBranchName,
        featureBranchName
      )

      const featureBranch = await getBranchOrError(
        repository,
        featureBranchName
      )

      const baseBranch = await getBranchOrError(repository, baseBranchName)

      const progress = new Array<IMultiCommitOperationProgress>()
      const result = await rebase(repository, baseBranch, featureBranch, p =>
        progress.push(p)
      )

      const snapshot = await getRebaseSnapshot(repository)

      const status = await getStatusOrThrow(repository)

      return { repository, result, snapshot, status, progress }
    }

    it('returns a value indicating conflicts were encountered', async t => {
      const { result } = await setup(t)
      assert.equal(result, RebaseResult.ConflictsEncountered)
    })

    it('reported step-by-step progress before encountering conflicts', async t => {
      const { progress } = await setup(t)
      assert.deepStrictEqual(progress, [
        {
          currentCommitSummary: 'Feature Branch!',
          kind: 'multiCommitOperation',
          position: 1,
          totalCommitCount: 1,
          value: 1,
        },
      ])
    })

    it('status detects REBASE_HEAD', async t => {
      const { snapshot } = await setup(t)

      assert(snapshot !== null)
      const s = snapshot
      assert.equal(s.commits.length, 1)
      assert.equal(s.commits[0].summary, 'Feature Branch!')

      assert.equal(s.progress.position, 1)
      assert.equal(s.progress.totalCommitCount, 1)
      assert.equal(s.progress.currentCommitSummary, 'Feature Branch!')
      assert.equal(s.progress.value, 1)
    })

    it('is a detached HEAD state', async t => {
      const { status } = await setup(t)
      assert(status.currentBranch === undefined)
    })
  })

  describe('can parse progress for long rebase', () => {
    const setup = async (t: TestContext) => {
      const repository = await createLongRebaseTest(
        t,
        baseBranchName,
        featureBranchName
      )

      const featureBranch = await getBranchOrError(
        repository,
        featureBranchName
      )

      const baseBranch = await getBranchOrError(repository, baseBranchName)

      const progress = new Array<IMultiCommitOperationProgress>()
      const result = await rebase(repository, baseBranch, featureBranch, p =>
        progress.push(p)
      )

      const snapshot = await getRebaseSnapshot(repository)

      const status = await getStatusOrThrow(repository)

      return { repository, result, snapshot, status, progress }
    }

    it('returns a value indicating conflicts were encountered', async t => {
      const { result } = await setup(t)
      assert.equal(result, RebaseResult.ConflictsEncountered)
    })

    it('reported step-by-step progress before encountering conflicts', async t => {
      const { progress } = await setup(t)
      assert.deepStrictEqual(progress, [
        {
          currentCommitSummary: 'Feature Branch First Commit!',
          kind: 'multiCommitOperation',
          position: 1,
          totalCommitCount: 10,
          value: 0.1,
        },
      ])
    })

    it('reports progress after resolving conflicts', async t => {
      const { progress, result, repository } = await setup(t)

      const strategy = ManualConflictResolution.theirs
      const progressCb = (p: IMultiCommitOperationProgress) => progress.push(p)

      let r = result
      while (r === RebaseResult.ConflictsEncountered) {
        r = await resolveAndContinue(repository, strategy, progressCb)
      }

      assert.equal(progress.length, 10)
      assert.deepStrictEqual(progress[9], {
        currentCommitSummary: 'Feature Branch Tenth Commit!',
        kind: 'multiCommitOperation',
        position: 10,
        totalCommitCount: 10,
        value: 1,
      })
    })

    it('status detects REBASE_HEAD', async t => {
      const { snapshot } = await setup(t)

      assert(snapshot !== null)
      const s = snapshot
      assert.equal(s.commits.length, 10)
      assert.equal(s.commits[0].summary, 'Feature Branch First Commit!')

      assert.equal(s.progress.position, 1)
      assert.equal(s.progress.totalCommitCount, 10)
      assert.equal(
        s.progress.currentCommitSummary,
        'Feature Branch First Commit!'
      )
      assert.equal(s.progress.value, 0.1)
    })

    it('is a detached HEAD state', async t => {
      const { status } = await setup(t)
      assert(status.currentBranch === undefined)
    })
  })
})

async function resolveAndContinue(
  repository: Repository,
  strategy: ManualConflictResolution,
  progressCallback: (progress: IMultiCommitOperationProgress) => void
) {
  const status = await getStatus(repository)
  const files = status?.workingDirectory.files ?? []
  const resolutions = new Map<string, ManualConflictResolution>()

  for (const file of files) {
    if (isConflictedFile(file.status)) {
      resolutions.set(file.path, strategy)
    }
  }

  return continueRebase(repository, files, resolutions, {
    progressCallback,
  })
}
