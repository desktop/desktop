import { describe, it, TestContext } from 'node:test'
import assert from 'node:assert'
import { exec } from 'dugite'
import { writeFile } from 'fs/promises'
import * as Path from 'path'

import { getChangedFiles } from '../../../../src/lib/git'
import {
  abortRebase,
  continueRebase,
  rebase,
  RebaseResult,
} from '../../../../src/lib/git/rebase'
import { AppFileStatusKind } from '../../../../src/models/status'
import { createRepository } from '../../../helpers/repository-builder-rebase-test'
import { getStatusOrThrow } from '../../../helpers/status'
import { getBranchOrError } from '../../../helpers/git'

const baseBranchName = 'base-branch'
const featureBranchName = 'this-is-a-feature'

describe('git/rebase', () => {
  describe('detect conflicts', () => {
    const setup = async (t: TestContext) => {
      const repository = await createRepository(
        t,
        baseBranchName,
        featureBranchName
      )

      const featureBranch = await getBranchOrError(
        repository,
        featureBranchName
      )
      const originalBranchTip = featureBranch.tip.sha

      const baseBranch = await getBranchOrError(repository, baseBranchName)
      const baseBranchTip = baseBranch.tip.sha

      const result = await rebase(repository, baseBranch, featureBranch)

      const status = await getStatusOrThrow(repository)

      return { result, status, originalBranchTip, baseBranchTip }
    }

    it('returns a value indicating conflicts were encountered', async t => {
      const { result } = await setup(t)
      assert.equal(result, RebaseResult.ConflictsEncountered)
    })

    it('status detects REBASE_HEAD', async t => {
      const { originalBranchTip, baseBranchTip, status } = await setup(t)

      assert.deepStrictEqual(status.rebaseInternalState, {
        originalBranchTip,
        baseBranchTip,
        targetBranch: 'this-is-a-feature',
      })
    })

    it('has conflicted files in working directory', async t => {
      const { status } = await setup(t)

      assert.equal(
        status.workingDirectory.files.filter(
          f => f.status.kind === AppFileStatusKind.Conflicted
        ).length,
        2
      )
    })

    it('is a detached HEAD state', async t => {
      const { status } = await setup(t)
      assert(status.currentBranch === undefined)
    })
  })

  describe('abort after conflicts found', () => {
    const setup = async (t: TestContext) => {
      const repository = await createRepository(
        t,
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

      return await getStatusOrThrow(repository)
    }

    it('REBASE_HEAD is no longer found', async t => {
      const status = await setup(t)
      assert(status.rebaseInternalState === null)
    })

    it('no longer has working directory changes', async t => {
      const status = await setup(t)
      assert.equal(status.workingDirectory.files.length, 0)
    })

    it('returns to the feature branch', async t => {
      const status = await setup(t)
      assert.equal(status.currentBranch, featureBranchName)
    })
  })

  describe('attempt to continue without resolving conflicts', () => {
    const setup = async (t: TestContext) => {
      const repository = await createRepository(
        t,
        baseBranchName,
        featureBranchName
      )

      const featureBranch = await getBranchOrError(
        repository,
        featureBranchName
      )
      const originalBranchTip = featureBranch.tip.sha

      const baseBranch = await getBranchOrError(repository, baseBranchName)
      const baseBranchTip = baseBranch.tip.sha

      await rebase(repository, baseBranch, featureBranch)

      // the second parameter here represents files that the UI indicates have
      // no conflict markers, so can be safely staged before continuing the
      // rebase
      const result = await continueRebase(repository, [])

      const status = await getStatusOrThrow(repository)

      return { result, status, originalBranchTip, baseBranchTip }
    }

    it('indicates that the rebase was not complete', async t => {
      const { result } = await setup(t)
      assert.equal(result, RebaseResult.OutstandingFilesNotStaged)
    })

    it('REBASE_HEAD is still found', async t => {
      const { status, originalBranchTip, baseBranchTip } = await setup(t)
      assert.deepStrictEqual(status.rebaseInternalState, {
        originalBranchTip,
        baseBranchTip,
        targetBranch: 'this-is-a-feature',
      })
    })

    it('still has conflicted files in working directory', async t => {
      const { status } = await setup(t)
      assert.equal(
        status.workingDirectory.files.filter(
          f => f.status.kind === AppFileStatusKind.Conflicted
        ).length,
        2
      )
    })
  })

  describe('continue after resolving conflicts', () => {
    const setup = async (t: TestContext) => {
      const repository = await createRepository(
        t,
        baseBranchName,
        featureBranchName
      )

      const featureBranch = await getBranchOrError(
        repository,
        featureBranchName
      )
      const beforeRebaseTip = featureBranch.tip

      const baseBranch = await getBranchOrError(repository, baseBranchName)

      await rebase(repository, baseBranch, featureBranch)

      const afterRebase = await getStatusOrThrow(repository)

      const { files } = afterRebase.workingDirectory

      const diffCheckBefore = await exec(['diff', '--check'], repository.path)

      assert(diffCheckBefore.exitCode > 0)

      // resolve conflicts by writing files to disk
      await writeFile(
        Path.join(repository.path, 'THING.md'),
        '# HELLO WORLD! \nTHINGS GO HERE\nFEATURE BRANCH UNDERWAY\n'
      )

      await writeFile(
        Path.join(repository.path, 'OTHER.md'),
        '# HELLO WORLD! \nTHINGS GO HERE\nALSO FEATURE BRANCH UNDERWAY\n'
      )

      const diffCheckAfter = await exec(['diff', '--check'], repository.path)

      assert.equal(diffCheckAfter.exitCode, 0)

      const result = await continueRebase(repository, files)

      const status = await getStatusOrThrow(repository)

      return { result, status, beforeRebaseTip }
    }

    it('returns success', async t => {
      const { result } = await setup(t)
      assert.equal(result, RebaseResult.CompletedWithoutError)
    })

    it('REBASE_HEAD is no longer found', async t => {
      const { status } = await setup(t)
      assert(status.rebaseInternalState === null)
    })

    it('no longer has working directory changes', async t => {
      const { status } = await setup(t)
      assert.equal(status.workingDirectory.files.length, 0)
    })

    it('returns to the feature branch', async t => {
      const { status } = await setup(t)

      assert.equal(status.currentBranch, featureBranchName)
    })

    it('branch is now a different ref', async t => {
      const { status, beforeRebaseTip } = await setup(t)
      assert.notEqual(status.currentTip, beforeRebaseTip.sha)
    })
  })

  describe('continue with additional changes unrelated to conflicted files', () => {
    const setup = async (t: TestContext) => {
      const repository = await createRepository(
        t,
        baseBranchName,
        featureBranchName
      )

      const featureBranch = await getBranchOrError(
        repository,
        featureBranchName
      )
      const beforeRebaseTip = featureBranch.tip

      const baseBranch = await getBranchOrError(repository, baseBranchName)

      await rebase(repository, baseBranch, featureBranch)

      // resolve conflicts by writing files to disk
      await writeFile(
        Path.join(repository.path, 'THING.md'),
        '# HELLO WORLD! \nTHINGS GO HERE\nFEATURE BRANCH UNDERWAY\n'
      )

      await writeFile(
        Path.join(repository.path, 'OTHER.md'),
        '# HELLO WORLD! \nTHINGS GO HERE\nALSO FEATURE BRANCH UNDERWAY\n'
      )

      // change unrelated tracked while rebasing changes
      await writeFile(
        Path.join(repository.path, 'THIRD.md'),
        'this change should be included in the latest commit'
      )

      // add untracked file before continuing rebase
      await writeFile(
        Path.join(repository.path, 'UNTRACKED-FILE.md'),
        'this file should remain in the working directory'
      )

      const afterRebase = await getStatusOrThrow(repository)

      const { files } = afterRebase.workingDirectory

      const result = await continueRebase(repository, files)

      const status = await getStatusOrThrow(repository)

      assert(status.currentTip !== undefined)

      const changesetData = await getChangedFiles(repository, status.currentTip)

      const filesInRebasedCommit = changesetData.files

      return { result, status, beforeRebaseTip, filesInRebasedCommit }
    }

    it('returns success', async t => {
      const { result } = await setup(t)
      assert.equal(result, RebaseResult.CompletedWithoutError)
    })

    it('keeps untracked working directory file out of rebase', async t => {
      const { status } = await setup(t)
      assert.equal(status.workingDirectory.files.length, 1)
    })

    it('has modified but unconflicted file in commit contents', async t => {
      const { filesInRebasedCommit } = await setup(t)

      assert(
        filesInRebasedCommit.find(f => f.path === 'THIRD.md') !== undefined
      )
    })

    it('returns to the feature branch', async t => {
      const { status } = await setup(t)

      assert.equal(status.currentBranch, featureBranchName)
    })

    it('branch is now a different ref', async t => {
      const { status, beforeRebaseTip } = await setup(t)

      assert.notEqual(status.currentTip, beforeRebaseTip.sha)
    })
  })

  describe('continue with tracked change omitted from list', () => {
    it('returns error code indicating that required files were missing', async t => {
      const repository = await createRepository(
        t,
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
      await writeFile(
        Path.join(repository.path, 'THING.md'),
        '# HELLO WORLD! \nTHINGS GO HERE\nFEATURE BRANCH UNDERWAY\n'
      )

      await writeFile(
        Path.join(repository.path, 'OTHER.md'),
        '# HELLO WORLD! \nTHINGS GO HERE\nALSO FEATURE BRANCH UNDERWAY\n'
      )

      // change unrelated tracked while rebasing changes
      await writeFile(
        Path.join(repository.path, 'THIRD.md'),
        'this change should be included in the latest commit'
      )

      const afterRebase = await getStatusOrThrow(repository)

      const { files } = afterRebase.workingDirectory

      // omit the last change should cause Git to error because it requires
      // all tracked changes to be staged as a prerequisite for rebasing
      const onlyConflictedFiles = files.filter(f => f.path !== 'THIRD.md')

      const result = await continueRebase(repository, onlyConflictedFiles)

      assert.equal(result, RebaseResult.OutstandingFilesNotStaged)
    })
  })
})
