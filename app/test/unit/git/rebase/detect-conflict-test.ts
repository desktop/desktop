import { GitProcess } from 'dugite'
import * as FSE from 'fs-extra'
import * as Path from 'path'

import { IStatusResult, getChangedFiles } from '../../../../src/lib/git'
import {
  abortRebase,
  continueRebase,
  rebase,
  RebaseResult,
} from '../../../../src/lib/git/rebase'
import {
  AppFileStatusKind,
  CommittedFileChange,
} from '../../../../src/models/status'
import { createRepository } from '../../../helpers/repository-builder-rebase-test'
import { getStatusOrThrow } from '../../../helpers/status'
import { getBranchOrError } from '../../../helpers/git'

const baseBranchName = 'base-branch'
const featureBranchName = 'this-is-a-feature'

describe('git/rebase', () => {
  describe('detect conflicts', () => {
    let result: RebaseResult
    let originalBranchTip: string
    let baseBranchTip: string
    let status: IStatusResult

    beforeEach(async () => {
      const repository = await createRepository(
        baseBranchName,
        featureBranchName
      )

      const featureBranch = await getBranchOrError(
        repository,
        featureBranchName
      )
      originalBranchTip = featureBranch.sha

      const baseBranch = await getBranchOrError(repository, baseBranchName)
      baseBranchTip = baseBranch.sha

      result = await rebase(repository, baseBranch, featureBranch)

      status = await getStatusOrThrow(repository)
    })

    it('returns a value indicating conflicts were encountered', async () => {
      expect(result).toBe(RebaseResult.ConflictsEncountered)
    })

    it('status detects REBASE_HEAD', async () => {
      expect(status.rebaseInternalState).toEqual({
        originalBranchTip,
        baseBranchTip,
        targetBranch: 'this-is-a-feature',
      })
    })

    it('has conflicted files in working directory', async () => {
      expect(
        status.workingDirectory.files.filter(
          f => f.status.kind === AppFileStatusKind.Conflicted
        )
      ).toHaveLength(2)
    })

    it('is a detached HEAD state', async () => {
      expect(status.currentBranch).toBeUndefined()
    })
  })

  describe('abort after conflicts found', () => {
    let status: IStatusResult

    beforeEach(async () => {
      const repository = await createRepository(
        baseBranchName,
        featureBranchName
      )

      const featureBranch = await getBranchOrError(
        repository,
        featureBranchName
      )

      const baseBranch = await getBranchOrError(repository, baseBranchName)

      await rebase(repository, baseBranch, featureBranch)

      await abortRebase(repository)

      status = await getStatusOrThrow(repository)
    })

    it('REBASE_HEAD is no longer found', async () => {
      expect(status.rebaseInternalState).toBeNull()
    })

    it('no longer has working directory changes', async () => {
      expect(status.workingDirectory.files).toHaveLength(0)
    })

    it('returns to the feature branch', async () => {
      expect(status.currentBranch).toBe(featureBranchName)
    })
  })

  describe('attempt to continue without resolving conflicts', () => {
    let result: RebaseResult
    let originalBranchTip: string
    let baseBranchTip: string
    let status: IStatusResult

    beforeEach(async () => {
      const repository = await createRepository(
        baseBranchName,
        featureBranchName
      )

      const featureBranch = await getBranchOrError(
        repository,
        featureBranchName
      )
      originalBranchTip = featureBranch.sha

      const baseBranch = await getBranchOrError(repository, baseBranchName)
      baseBranchTip = baseBranch.sha

      await rebase(repository, baseBranch, featureBranch)

      // the second parameter here represents files that the UI indicates have
      // no conflict markers, so can be safely staged before continuing the
      // rebase
      result = await continueRebase(repository, [])

      status = await getStatusOrThrow(repository)
    })

    it('indicates that the rebase was not complete', async () => {
      expect(result).toBe(RebaseResult.OutstandingFilesNotStaged)
    })

    it('REBASE_HEAD is still found', async () => {
      expect(status.rebaseInternalState).toEqual({
        originalBranchTip,
        baseBranchTip,
        targetBranch: 'this-is-a-feature',
      })
    })

    it('still has conflicted files in working directory', async () => {
      expect(
        status!.workingDirectory.files.filter(
          f => f.status.kind === AppFileStatusKind.Conflicted
        )
      ).toHaveLength(2)
    })
  })

  describe('continue after resolving conflicts', () => {
    let beforeRebaseTip: string
    let result: RebaseResult
    let status: IStatusResult

    beforeEach(async () => {
      const repository = await createRepository(
        baseBranchName,
        featureBranchName
      )

      const featureBranch = await getBranchOrError(
        repository,
        featureBranchName
      )
      beforeRebaseTip = featureBranch.sha

      const baseBranch = await getBranchOrError(repository, baseBranchName)

      await rebase(repository, baseBranch, featureBranch)

      const afterRebase = await getStatusOrThrow(repository)

      const { files } = afterRebase.workingDirectory

      const diffCheckBefore = await GitProcess.exec(
        ['diff', '--check'],
        repository.path
      )

      expect(diffCheckBefore.exitCode).toBeGreaterThan(0)

      // resolve conflicts by writing files to disk
      await FSE.writeFile(
        Path.join(repository.path, 'THING.md'),
        '# HELLO WORLD! \nTHINGS GO HERE\nFEATURE BRANCH UNDERWAY\n'
      )

      await FSE.writeFile(
        Path.join(repository.path, 'OTHER.md'),
        '# HELLO WORLD! \nTHINGS GO HERE\nALSO FEATURE BRANCH UNDERWAY\n'
      )

      const diffCheckAfter = await GitProcess.exec(
        ['diff', '--check'],
        repository.path
      )

      expect(diffCheckAfter.exitCode).toEqual(0)

      result = await continueRebase(repository, files)

      status = await getStatusOrThrow(repository)
    })

    it('returns success', () => {
      expect(result).toBe(RebaseResult.CompletedWithoutError)
    })

    it('REBASE_HEAD is no longer found', () => {
      expect(status.rebaseInternalState).toBeNull()
    })

    it('no longer has working directory changes', () => {
      expect(status.workingDirectory.files).toHaveLength(0)
    })

    it('returns to the feature branch', () => {
      expect(status.currentBranch).toBe(featureBranchName)
    })

    it('branch is now a different ref', () => {
      expect(status.currentTip).not.toBe(beforeRebaseTip)
    })
  })

  describe('continue with additional changes unrelated to conflicted files', () => {
    let beforeRebaseTip: string
    let filesInRebasedCommit: ReadonlyArray<CommittedFileChange>
    let result: RebaseResult
    let status: IStatusResult

    beforeEach(async () => {
      const repository = await createRepository(
        baseBranchName,
        featureBranchName
      )

      const featureBranch = await getBranchOrError(
        repository,
        featureBranchName
      )
      beforeRebaseTip = featureBranch.sha

      const baseBranch = await getBranchOrError(repository, baseBranchName)

      await rebase(repository, baseBranch, featureBranch)

      // resolve conflicts by writing files to disk
      await FSE.writeFile(
        Path.join(repository.path, 'THING.md'),
        '# HELLO WORLD! \nTHINGS GO HERE\nFEATURE BRANCH UNDERWAY\n'
      )

      await FSE.writeFile(
        Path.join(repository.path, 'OTHER.md'),
        '# HELLO WORLD! \nTHINGS GO HERE\nALSO FEATURE BRANCH UNDERWAY\n'
      )

      // change unrelated tracked while rebasing changes
      await FSE.writeFile(
        Path.join(repository.path, 'THIRD.md'),
        'this change should be included in the latest commit'
      )

      // add untracked file before continuing rebase
      await FSE.writeFile(
        Path.join(repository.path, 'UNTRACKED-FILE.md'),
        'this file should remain in the working directory'
      )

      const afterRebase = await getStatusOrThrow(repository)

      const { files } = afterRebase.workingDirectory

      result = await continueRebase(repository, files)

      status = await getStatusOrThrow(repository)

      filesInRebasedCommit = await getChangedFiles(
        repository,
        status.currentTip!
      )
    })

    it('returns success', () => {
      expect(result).toBe(RebaseResult.CompletedWithoutError)
    })

    it('keeps untracked working directory file out of rebase', () => {
      expect(status.workingDirectory.files).toHaveLength(1)
    })

    it('has modified but unconflicted file in commit contents', () => {
      expect(
        filesInRebasedCommit.find(f => f.path === 'THIRD.md')
      ).not.toBeUndefined()
    })

    it('returns to the feature branch', () => {
      expect(status.currentBranch).toBe(featureBranchName)
    })

    it('branch is now a different ref', () => {
      expect(status.currentTip).not.toBe(beforeRebaseTip)
    })
  })

  describe('continue with tracked change omitted from list', () => {
    let result: RebaseResult

    beforeEach(async () => {
      const repository = await createRepository(
        baseBranchName,
        featureBranchName
      )

      const featureBranch = await getBranchOrError(
        repository,
        featureBranchName
      )

      const baseBranch = await getBranchOrError(repository, baseBranchName)

      await rebase(repository, baseBranch, featureBranch)

      // resolve conflicts by writing files to disk
      await FSE.writeFile(
        Path.join(repository.path, 'THING.md'),
        '# HELLO WORLD! \nTHINGS GO HERE\nFEATURE BRANCH UNDERWAY\n'
      )

      await FSE.writeFile(
        Path.join(repository.path, 'OTHER.md'),
        '# HELLO WORLD! \nTHINGS GO HERE\nALSO FEATURE BRANCH UNDERWAY\n'
      )

      // change unrelated tracked while rebasing changes
      await FSE.writeFile(
        Path.join(repository.path, 'THIRD.md'),
        'this change should be included in the latest commit'
      )

      const afterRebase = await getStatusOrThrow(repository)

      const { files } = afterRebase.workingDirectory

      // omit the last change should cause Git to error because it requires
      // all tracked changes to be staged as a prerequisite for rebasing
      const onlyConflictedFiles = files.filter(f => f.path !== 'THIRD.md')

      result = await continueRebase(repository, onlyConflictedFiles)
    })

    it('returns error code indicating that required files were missing', () => {
      expect(result).toBe(RebaseResult.OutstandingFilesNotStaged)
    })
  })
})
