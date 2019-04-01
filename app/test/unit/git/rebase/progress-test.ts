import { IStatusResult } from '../../../../src/lib/git'
import {
  rebase,
  RebaseResult,
  getCurrentProgress,
} from '../../../../src/lib/git/rebase'
import { createRepository as createShortRebaseTest } from '../../../helpers/repository-builder-rebase-test'
import { createRepository as createLongRebaseTest } from '../../../helpers/repository-builder-long-rebase-test'
import { getStatusOrThrow } from '../../../helpers/status'
import { RebaseProgressSummary } from '../../../../src/models/rebase'
import { setupEmptyDirectory } from '../../../helpers/repositories'

const baseBranch = 'base-branch'
const featureBranch = 'this-is-a-feature'

describe('git/rebase', () => {
  describe('skips a normal repository', () => {
    it('returns null for rebase progress', async () => {
      const repository = await setupEmptyDirectory()

      const progress = await getCurrentProgress(repository)

      expect(progress).toEqual(null)
    })
  })

  describe('can parse progress', () => {
    let result: RebaseResult
    let progress: RebaseProgressSummary | null
    let status: IStatusResult

    beforeEach(async () => {
      const repository = await createShortRebaseTest(baseBranch, featureBranch)

      result = await rebase(repository, baseBranch, featureBranch)

      progress = await getCurrentProgress(repository)

      status = await getStatusOrThrow(repository)
    })

    it('returns a value indicating conflicts were encountered', () => {
      expect(result).toBe(RebaseResult.ConflictsEncountered)
    })

    it('status detects REBASE_HEAD', () => {
      expect(progress).not.toEqual(null)
      const p = progress!
      expect(p.commits.length).toEqual(1)
      expect(p.commits[0].summary).toEqual('Feature Branch!')

      expect(p.rebasedCommitCount).toEqual(1)
      expect(p.value).toEqual(1)
    })

    it('is a detached HEAD state', () => {
      expect(status.currentBranch).toBeUndefined()
    })
  })

  describe('can parse progress for long rebase', () => {
    let result: RebaseResult
    let progress: RebaseProgressSummary | null
    let status: IStatusResult

    beforeEach(async () => {
      const repository = await createLongRebaseTest(baseBranch, featureBranch)

      result = await rebase(repository, baseBranch, featureBranch)

      progress = await getCurrentProgress(repository)

      status = await getStatusOrThrow(repository)
    })

    it('returns a value indicating conflicts were encountered', () => {
      expect(result).toBe(RebaseResult.ConflictsEncountered)
    })

    it('status detects REBASE_HEAD', () => {
      expect(progress).not.toEqual(null)
      const p = progress!
      expect(p.commits.length).toEqual(10)
      expect(p.commits[0].summary).toEqual('Feature Branch First Commit!')

      expect(p.rebasedCommitCount).toEqual(1)
      expect(p.value).toEqual(0.1)
    })

    it('is a detached HEAD state', () => {
      expect(status.currentBranch).toBeUndefined()
    })
  })
})
