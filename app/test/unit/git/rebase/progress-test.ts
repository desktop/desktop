import {
  IStatusResult,
  continueRebase,
  getStatus,
} from '../../../../src/lib/git'
import {
  rebase,
  RebaseResult,
  getRebaseSnapshot,
} from '../../../../src/lib/git'
import { createRepository as createShortRebaseTest } from '../../../helpers/repository-builder-rebase-test'
import { createRepository as createLongRebaseTest } from '../../../helpers/repository-builder-long-rebase-test'
import { getStatusOrThrow } from '../../../helpers/status'
import { GitRebaseSnapshot } from '../../../../src/models/rebase'
import { setupEmptyDirectory } from '../../../helpers/repositories'
import { getBranchOrError } from '../../../helpers/git'
import { IRebaseProgress } from '../../../../src/models/progress'
import { isConflictedFile } from '../../../../src/lib/status'
import { ManualConflictResolution } from '../../../../src/models/manual-conflict-resolution'
import { Repository } from '../../../../src/models/repository'

const baseBranchName = 'base-branch'
const featureBranchName = 'this-is-a-feature'

describe('git/rebase', () => {
  describe('skips a normal repository', () => {
    it('returns null for rebase progress', async () => {
      const repository = setupEmptyDirectory()
      const progress = await getRebaseSnapshot(repository)

      expect(progress).toEqual(null)
    })
  })

  describe('can parse progress', () => {
    let repository: Repository | null
    let result: RebaseResult
    let snapshot: GitRebaseSnapshot | null
    let status: IStatusResult
    let progress = new Array<IRebaseProgress>()

    beforeEach(async () => {
      repository = await createShortRebaseTest(
        baseBranchName,
        featureBranchName
      )

      const featureBranch = await getBranchOrError(
        repository,
        featureBranchName
      )

      const baseBranch = await getBranchOrError(repository, baseBranchName)

      progress = new Array<IRebaseProgress>()
      result = await rebase(repository, baseBranch, featureBranch, p =>
        progress.push(p)
      )

      snapshot = await getRebaseSnapshot(repository)

      status = await getStatusOrThrow(repository)
    })

    it('returns a value indicating conflicts were encountered', () => {
      expect(result).toBe(RebaseResult.ConflictsEncountered)
    })

    it('reported step-by-step progress before encountering conflicts', () => {
      expect(progress).toEqual([
        {
          currentCommitSummary: 'Feature Branch!',
          kind: 'rebase',
          rebasedCommitCount: 1,
          title: 'Rebasing commit 1 of 1 commits',
          totalCommitCount: 1,
          value: 1,
        },
      ])
    })

    it('status detects REBASE_HEAD', () => {
      expect(snapshot).not.toEqual(null)
      const s = snapshot!
      expect(s.commits.length).toEqual(1)
      expect(s.commits[0].summary).toEqual('Feature Branch!')

      expect(s.progress.rebasedCommitCount).toEqual(1)
      expect(s.progress.totalCommitCount).toEqual(1)
      expect(s.progress.currentCommitSummary).toEqual('Feature Branch!')
      expect(s.progress.value).toEqual(1)
    })

    it('is a detached HEAD state', () => {
      expect(status.currentBranch).toBeUndefined()
    })
  })

  describe('can parse progress for long rebase', () => {
    let repository: Repository | null
    let result: RebaseResult
    let snapshot: GitRebaseSnapshot | null
    let status: IStatusResult
    let progress = new Array<IRebaseProgress>()

    beforeEach(async () => {
      repository = await createLongRebaseTest(baseBranchName, featureBranchName)

      const featureBranch = await getBranchOrError(
        repository,
        featureBranchName
      )

      const baseBranch = await getBranchOrError(repository, baseBranchName)

      progress = new Array<IRebaseProgress>()
      result = await rebase(repository, baseBranch, featureBranch, p =>
        progress.push(p)
      )

      snapshot = await getRebaseSnapshot(repository)

      status = await getStatusOrThrow(repository)
    })

    it('returns a value indicating conflicts were encountered', () => {
      expect(result).toBe(RebaseResult.ConflictsEncountered)
    })

    it('reported step-by-step progress before encountering conflicts', () => {
      expect(progress).toEqual([
        {
          currentCommitSummary: 'Feature Branch First Commit!',
          kind: 'rebase',
          rebasedCommitCount: 1,
          title: 'Rebasing commit 1 of 10 commits',
          totalCommitCount: 10,
          value: 0.1,
        },
      ])
    })

    it('reports progress after resolving conflicts', async () => {
      const strategy = ManualConflictResolution.theirs
      const progressCb = (p: IRebaseProgress) => progress.push(p)

      while (result === RebaseResult.ConflictsEncountered) {
        result = await resolveAndContinue(repository!, strategy, progressCb)
      }

      expect(progress.length).toEqual(10)
      expect(progress[9]).toEqual({
        currentCommitSummary: 'Feature Branch Tenth Commit!',
        kind: 'rebase',
        rebasedCommitCount: 10,
        title: 'Rebasing commit 10 of 10 commits',
        totalCommitCount: 10,
        value: 1,
      })
    })

    it('status detects REBASE_HEAD', () => {
      expect(snapshot).not.toEqual(null)
      const s = snapshot!
      expect(s.commits.length).toEqual(10)
      expect(s.commits[0].summary).toEqual('Feature Branch First Commit!')

      expect(s.progress.rebasedCommitCount).toEqual(1)
      expect(s.progress.totalCommitCount).toEqual(10)
      expect(s.progress.currentCommitSummary).toEqual(
        'Feature Branch First Commit!'
      )
      expect(s.progress.value).toEqual(0.1)
    })

    it('is a detached HEAD state', () => {
      expect(status.currentBranch).toBeUndefined()
    })
  })
})

async function resolveAndContinue(
  repository: Repository,
  strategy: ManualConflictResolution,
  progressCb: (progress: IRebaseProgress) => void
) {
  const status = await getStatus(repository)
  const files = status?.workingDirectory.files ?? []
  const resolutions = new Map<string, ManualConflictResolution>()

  for (const file of files) {
    if (isConflictedFile(file.status)) {
      resolutions.set(file.path, strategy)
    }
  }

  return continueRebase(repository, files, resolutions, progressCb)
}
