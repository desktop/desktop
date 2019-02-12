import { IGitResult, GitProcess } from 'dugite'
import * as FSE from 'fs-extra'
import * as Path from 'path'

import { IStatusResult } from '../../../../src/lib/git'
import {
  abortRebase,
  continueRebase,
  rebase,
  ContinueRebaseResult,
} from '../../../../src/lib/git/rebase'
import { Commit } from '../../../../src/models/commit'
import { AppFileStatusKind } from '../../../../src/models/status'
import { createRepository } from '../../../helpers/repository-builder-rebase-test'
import { getStatusOrThrow } from '../../../helpers/status'
import { getRefOrError } from '../../../helpers/tip'

const baseBranch = 'base-branch'
const featureBranch = 'this-is-a-feature'

describe('git/rebase', () => {
  describe('detect conflicts', () => {
    let result: IGitResult
    let status: IStatusResult

    beforeEach(async () => {
      const repository = await createRepository(baseBranch, featureBranch)

      result = await rebase(repository, baseBranch, featureBranch)

      status = await getStatusOrThrow(repository)
    })

    it('returns a non-zero exit code', async () => {
      expect(result.exitCode).toBeGreaterThan(0)
    })

    it('status detects REBASE_HEAD', async () => {
      expect(status.rebaseHeadFound).toBe(true)
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
      const repository = await createRepository(baseBranch, featureBranch)

      await rebase(repository, baseBranch, featureBranch)

      await abortRebase(repository)

      status = await getStatusOrThrow(repository)
    })

    it('REBASE_HEAD is no longer found', async () => {
      expect(status.rebaseHeadFound).toBe(false)
    })

    it('no longer has working directory changes', async () => {
      expect(status.workingDirectory.files).toHaveLength(0)
    })

    it('returns to the feature branch', async () => {
      expect(status.currentBranch).toBe(featureBranch)
    })
  })

  describe('attempt to continue without resolving conflicts', () => {
    let result: ContinueRebaseResult
    let status: IStatusResult

    beforeEach(async () => {
      const repository = await createRepository(baseBranch, featureBranch)

      await rebase(repository, baseBranch, featureBranch)

      // the second parameter here represents files that the UI indicates have
      // no conflict markers, so can be safely staged before continuing the
      // rebase
      result = await continueRebase(repository, [])

      status = await getStatusOrThrow(repository)
    })

    it('indicates that the rebase was not complete', async () => {
      expect(result).toBe(ContinueRebaseResult.OutstandingFilesNotStaged)
    })

    it('REBASE_HEAD is still found', async () => {
      expect(status.rebaseHeadFound).toBe(true)
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
    let beforeRebaseTip: Commit
    let result: ContinueRebaseResult
    let status: IStatusResult

    beforeEach(async () => {
      const repository = await createRepository(baseBranch, featureBranch)

      beforeRebaseTip = await getRefOrError(repository, featureBranch)

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
      expect(result).toBe(ContinueRebaseResult.CompletedWithoutError)
    })

    it('REBASE_HEAD is no longer found', () => {
      expect(status.rebaseHeadFound).toBe(false)
    })

    it('no longer has working directory changes', () => {
      expect(status.workingDirectory.files).toHaveLength(0)
    })

    it('returns to the feature branch', () => {
      expect(status.currentBranch).toBe(featureBranch)
    })

    it('branch is now a different ref', () => {
      expect(status.currentTip).not.toBe(beforeRebaseTip.sha)
    })
  })
})
