import { describe, it, TestContext } from 'node:test'
import assert from 'node:assert'
import * as path from 'path'
import { readFile, unlink, writeFile } from 'fs/promises'
import { pathExists } from '../../../src/ui/lib/path-exists'

import { Repository } from '../../../src/models/repository'
import {
  createCommit,
  getCommits,
  getCommit,
  getChangedFiles,
  getWorkingDirectoryDiff,
  createMergeCommit,
} from '../../../src/lib/git'

import {
  setupFixtureRepository,
  setupEmptyRepository,
  setupConflictedRepo,
  setupConflictedRepoWithMultipleFiles,
} from '../../helpers/repositories'

import { exec } from 'dugite'
import {
  WorkingDirectoryFileChange,
  AppFileStatusKind,
  UnmergedEntrySummary,
  GitStatusEntry,
  isManualConflict,
} from '../../../src/models/status'
import {
  DiffSelectionType,
  DiffSelection,
  ITextDiff,
  DiffType,
} from '../../../src/models/diff'
import { getStatusOrThrow } from '../../helpers/status'
import { ManualConflictResolution } from '../../../src/models/manual-conflict-resolution'
import { isConflictedFile } from '../../../src/lib/status'

async function getTextDiff(
  repo: Repository,
  file: WorkingDirectoryFileChange
): Promise<ITextDiff> {
  const diff = await getWorkingDirectoryDiff(repo, file)
  assert.equal(diff.kind, DiffType.Text)
  return diff as ITextDiff
}

describe('git/commit', () => {
  describe('createCommit normal', () => {
    it('commits the given files', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'test-repo')
      const repository = new Repository(testRepoPath, -1, null, false)
      await writeFile(path.join(repository.path, 'README.md'), 'Hi world\n')

      let status = await getStatusOrThrow(repository)
      let files = status.workingDirectory.files
      assert.equal(files.length, 1)

      const sha = await createCommit(repository, 'Special commit', files)
      assert.equal(sha.length, 7)

      status = await getStatusOrThrow(repository)
      files = status.workingDirectory.files
      assert.equal(files.length, 0)

      const commits = await getCommits(repository, 'HEAD', 100)
      assert.equal(commits.length, 6)
      assert.equal(commits[0].summary, 'Special commit')
      assert.equal(commits[0].sha.substring(0, 7), sha)
    })

    it('commit does not strip commentary by default', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'test-repo')
      const repository = new Repository(testRepoPath, -1, null, false)

      await writeFile(path.join(repository.path, 'README.md'), 'Hi world\n')

      const status = await getStatusOrThrow(repository)
      const files = status.workingDirectory.files
      assert.equal(files.length, 1)

      const message = `Special commit

# this is a comment`

      const sha = await createCommit(repository, message, files)
      assert.equal(sha.length, 7)

      const commit = await getCommit(repository, 'HEAD')
      assert(commit !== null)
      assert.equal(commit.summary, 'Special commit')
      assert.equal(commit.body, '# this is a comment\n')
      assert.equal(commit.shortSha, sha)
    })

    it('can commit for empty repository', async t => {
      const repo = await setupEmptyRepository(t)

      await writeFile(path.join(repo.path, 'foo'), 'foo\n')
      await writeFile(path.join(repo.path, 'bar'), 'bar\n')

      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files

      assert.equal(files.length, 2)

      const allChanges = [
        files[0].withIncludeAll(true),
        files[1].withIncludeAll(true),
      ]

      const sha = await createCommit(
        repo,
        'added two files\n\nthis is a description',
        allChanges
      )
      assert.equal(sha, '(root-commit)')

      const statusAfter = await getStatusOrThrow(repo)

      assert.equal(statusAfter.workingDirectory.files.length, 0)

      const history = await getCommits(repo, 'HEAD', 2)

      assert.equal(history.length, 1)
      assert.equal(history[0].summary, 'added two files')
      assert.equal(history[0].body, 'this is a description\n')
    })

    it('can commit renames', async t => {
      const repo = await setupEmptyRepository(t)

      await writeFile(path.join(repo.path, 'foo'), 'foo\n')

      await exec(['add', 'foo'], repo.path)
      await exec(['commit', '-m', 'Initial commit'], repo.path)
      await exec(['mv', 'foo', 'bar'], repo.path)

      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files

      assert.equal(files.length, 1)

      const sha = await createCommit(repo, 'renamed a file', [
        files[0].withIncludeAll(true),
      ])
      assert.equal(sha.length, 7)

      const statusAfter = await getStatusOrThrow(repo)

      assert.equal(statusAfter.workingDirectory.files.length, 0)
    })
  })

  describe('createCommit partials', () => {
    it('can commit some lines from new file', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'repo-with-changes')
      const repository = new Repository(testRepoPath, -1, null, false)

      const previousTip = (await getCommits(repository, 'HEAD', 1))[0]

      const newFileName = 'new-file.md'

      // select first five lines of file
      const selection = DiffSelection.fromInitialSelection(
        DiffSelectionType.None
      ).withRangeSelection(0, 5, true)

      const file = new WorkingDirectoryFileChange(
        newFileName,
        { kind: AppFileStatusKind.New },
        selection
      )

      // commit just this change, ignore everything else
      const sha = await createCommit(repository, 'title', [file])
      assert.equal(sha.length, 7)

      // verify that the HEAD of the repository has moved
      const newTip = (await getCommits(repository, 'HEAD', 1))[0]
      assert.notEqual(newTip.sha, previousTip.sha)
      assert.equal(newTip.summary, 'title')
      assert.equal(newTip.shortSha, sha)

      // verify that the contents of this new commit are just the new file
      const changesetData = await getChangedFiles(repository, newTip.sha)
      assert.equal(changesetData.files.length, 1)
      assert.equal(changesetData.files[0].path, newFileName)

      // verify that changes remain for this new file
      const status = await getStatusOrThrow(repository)
      assert.equal(status.workingDirectory.files.length, 4)

      // verify that the file is now tracked
      const fileChange = status.workingDirectory.files.find(
        f => f.path === newFileName
      )
      assert(fileChange !== undefined)
      assert.equal(fileChange.status.kind, AppFileStatusKind.Modified)
    })

    it('can commit second hunk from modified file', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'repo-with-changes')
      const repository = new Repository(testRepoPath, -1, null, false)

      const previousTip = (await getCommits(repository, 'HEAD', 1))[0]

      const modifiedFile = 'modified-file.md'

      const unselectedFile = DiffSelection.fromInitialSelection(
        DiffSelectionType.None
      )
      const file = new WorkingDirectoryFileChange(
        modifiedFile,
        { kind: AppFileStatusKind.Modified },
        unselectedFile
      )

      const diff = await getTextDiff(repository, file)

      const selection = DiffSelection.fromInitialSelection(
        DiffSelectionType.All
      ).withRangeSelection(
        diff.hunks[0].unifiedDiffStart,
        diff.hunks[0].unifiedDiffEnd - diff.hunks[0].unifiedDiffStart,
        false
      )

      const updatedFile = file.withSelection(selection)

      // commit just this change, ignore everything else
      const sha = await createCommit(repository, 'title', [updatedFile])
      assert.equal(sha.length, 7)

      // verify that the HEAD of the repository has moved
      const newTip = (await getCommits(repository, 'HEAD', 1))[0]
      assert.notEqual(newTip.sha, previousTip.sha)
      assert.equal(newTip.summary, 'title')

      // verify that the contents of this new commit are just the modified file
      const changesetData = await getChangedFiles(repository, newTip.sha)
      assert.equal(changesetData.files.length, 1)
      assert.equal(changesetData.files[0].path, modifiedFile)

      // verify that changes remain for this modified file
      const status = await getStatusOrThrow(repository)
      assert.equal(status.workingDirectory.files.length, 4)

      // verify that the file is still marked as modified
      const fileChange = status.workingDirectory.files.find(
        f => f.path === modifiedFile
      )
      assert(fileChange !== undefined)
      assert.equal(fileChange.status.kind, AppFileStatusKind.Modified)
    })

    it('can commit single delete from modified file', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'repo-with-changes')
      const repository = new Repository(testRepoPath, -1, null, false)

      const previousTip = (await getCommits(repository, 'HEAD', 1))[0]

      const fileName = 'modified-file.md'

      const unselectedFile = DiffSelection.fromInitialSelection(
        DiffSelectionType.None
      )
      const modifiedFile = new WorkingDirectoryFileChange(
        fileName,
        { kind: AppFileStatusKind.Modified },
        unselectedFile
      )

      const diff = await getTextDiff(repository, modifiedFile)

      const secondRemovedLine = diff.hunks[0].unifiedDiffStart + 5

      const selection = DiffSelection.fromInitialSelection(
        DiffSelectionType.None
      ).withRangeSelection(secondRemovedLine, 1, true)

      const file = new WorkingDirectoryFileChange(
        fileName,
        { kind: AppFileStatusKind.Modified },
        selection
      )

      // commit just this change, ignore everything else
      const sha = await createCommit(repository, 'title', [file])
      assert.equal(sha.length, 7)

      // verify that the HEAD of the repository has moved
      const newTip = (await getCommits(repository, 'HEAD', 1))[0]
      assert.notEqual(newTip.sha, previousTip.sha)
      assert.equal(newTip.summary, 'title')
      assert.equal(newTip.shortSha, sha)

      // verify that the contents of this new commit are just the modified file
      const changesetData = await getChangedFiles(repository, newTip.sha)
      assert.equal(changesetData.files.length, 1)
      assert.equal(changesetData.files[0].path, fileName)
    })

    it('can commit multiple hunks from modified file', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'repo-with-changes')
      const repository = new Repository(testRepoPath, -1, null, false)

      const previousTip = (await getCommits(repository, 'HEAD', 1))[0]

      const modifiedFile = 'modified-file.md'

      const unselectedFile = DiffSelection.fromInitialSelection(
        DiffSelectionType.None
      )
      const file = new WorkingDirectoryFileChange(
        modifiedFile,
        { kind: AppFileStatusKind.Modified },
        unselectedFile
      )

      const diff = await getTextDiff(repository, file)

      const selection = DiffSelection.fromInitialSelection(
        DiffSelectionType.All
      ).withRangeSelection(
        diff.hunks[1].unifiedDiffStart,
        diff.hunks[1].unifiedDiffEnd - diff.hunks[1].unifiedDiffStart,
        false
      )

      const updatedFile = new WorkingDirectoryFileChange(
        modifiedFile,
        { kind: AppFileStatusKind.Modified },
        selection
      )

      // commit just this change, ignore everything else
      const sha = await createCommit(repository, 'title', [updatedFile])
      assert.equal(sha.length, 7)

      // verify that the HEAD of the repository has moved
      const newTip = (await getCommits(repository, 'HEAD', 1))[0]
      assert.notEqual(newTip.sha, previousTip.sha)
      assert.equal(newTip.summary, 'title')
      assert.equal(newTip.shortSha, sha)

      // verify that the contents of this new commit are just the modified file
      const changesetData = await getChangedFiles(repository, newTip.sha)
      assert.equal(changesetData.files.length, 1)
      assert.equal(changesetData.files[0].path, modifiedFile)

      // verify that changes remain for this modified file
      const status = await getStatusOrThrow(repository)
      assert.equal(status.workingDirectory.files.length, 4)

      // verify that the file is still marked as modified
      const fileChange = status.workingDirectory.files.find(
        f => f.path === modifiedFile
      )
      assert(fileChange !== undefined)
      assert.equal(fileChange.status.kind, AppFileStatusKind.Modified)
    })

    it('can commit some lines from deleted file', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'repo-with-changes')
      const repository = new Repository(testRepoPath, -1, null, false)

      const previousTip = (await getCommits(repository, 'HEAD', 1))[0]

      const deletedFile = 'deleted-file.md'

      const selection = DiffSelection.fromInitialSelection(
        DiffSelectionType.None
      ).withRangeSelection(0, 5, true)

      const file = new WorkingDirectoryFileChange(
        deletedFile,
        { kind: AppFileStatusKind.Deleted },
        selection
      )

      // commit just this change, ignore everything else
      const sha = await createCommit(repository, 'title', [file])
      assert.equal(sha.length, 7)

      // verify that the HEAD of the repository has moved
      const newTip = (await getCommits(repository, 'HEAD', 1))[0]
      assert.notEqual(newTip.sha, previousTip.sha)
      assert.equal(newTip.summary, 'title')
      assert.equal(newTip.sha.substring(0, 7), sha)

      // verify that the contents of this new commit are just the new file
      const changesetData = await getChangedFiles(repository, newTip.sha)
      assert.equal(changesetData.files.length, 1)
      assert.equal(changesetData.files[0].path, deletedFile)

      // verify that changes remain for this new file
      const status = await getStatusOrThrow(repository)
      assert.equal(status.workingDirectory.files.length, 4)

      // verify that the file is now tracked
      const fileChange = status.workingDirectory.files.find(
        f => f.path === deletedFile
      )
      assert(fileChange !== undefined)
      assert.equal(fileChange.status.kind, AppFileStatusKind.Deleted)
    })

    it('can commit renames with modifications', async t => {
      const repo = await setupEmptyRepository(t)

      await writeFile(path.join(repo.path, 'foo'), 'foo\n')

      await exec(['add', 'foo'], repo.path)
      await exec(['commit', '-m', 'Initial commit'], repo.path)
      await exec(['mv', 'foo', 'bar'], repo.path)

      await writeFile(path.join(repo.path, 'bar'), 'bar\n')

      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files

      assert.equal(files.length, 1)

      const sha = await createCommit(repo, 'renamed a file', [
        files[0].withIncludeAll(true),
      ])
      assert.equal(sha.length, 7)

      const statusAfter = await getStatusOrThrow(repo)
      assert(statusAfter.currentTip !== undefined)

      assert.equal(statusAfter.workingDirectory.files.length, 0)
      assert.equal(statusAfter.currentTip.substring(0, 7), sha)
    })

    // The scenario here is that the user has staged a rename (probably using git mv)
    // and then added some lines to the newly renamed file and they only want to
    // commit one of these lines.
    it('can commit renames with partially selected modifications', async t => {
      const repo = await setupEmptyRepository(t)

      await writeFile(path.join(repo.path, 'foo'), 'line1\n')

      await exec(['add', 'foo'], repo.path)
      await exec(['commit', '-m', 'Initial commit'], repo.path)
      await exec(['mv', 'foo', 'bar'], repo.path)

      await writeFile(path.join(repo.path, 'bar'), 'line1\nline2\nline3\n')

      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files

      assert.equal(files.length, 1)
      assert(files[0].path.includes('bar'))
      assert.equal(files[0].status.kind, AppFileStatusKind.Renamed)

      const selection = files[0].selection
        .withSelectNone()
        .withLineSelection(2, true)

      const partiallySelectedFile = files[0].withSelection(selection)

      const sha = await createCommit(repo, 'renamed a file', [
        partiallySelectedFile,
      ])
      assert.equal(sha.length, 7)

      const statusAfter = await getStatusOrThrow(repo)

      assert.equal(statusAfter.workingDirectory.files.length, 1)

      const diff = await getTextDiff(
        repo,
        statusAfter.workingDirectory.files[0]
      )

      assert.equal(diff.hunks.length, 1)
      assert.equal(diff.hunks[0].lines.length, 4)
      assert.equal(diff.hunks[0].lines[3].text, '+line3')
    })
  })

  describe('createCommit with a merge conflict', () => {
    it('creates a merge commit', async t => {
      const repo = await setupConflictedRepo(t)
      const filePath = path.join(repo.path, 'foo')

      const inMerge = await pathExists(
        path.join(repo.path, '.git', 'MERGE_HEAD')
      )
      assert(inMerge)

      await writeFile(filePath, 'b1b2')

      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files

      assert.equal(files.length, 1)
      assert.equal(files[0].path, 'foo')

      assert.deepStrictEqual(files[0].status, {
        kind: AppFileStatusKind.Conflicted,
        entry: {
          kind: 'conflicted',
          action: UnmergedEntrySummary.BothModified,
          them: GitStatusEntry.UpdatedButUnmerged,
          us: GitStatusEntry.UpdatedButUnmerged,
          submoduleStatus: undefined,
        },
        conflictMarkerCount: 0,
      })

      const selection = files[0].selection.withSelectAll()
      const selectedFile = files[0].withSelection(selection)
      const sha = await createCommit(repo, 'Merge commit!', [selectedFile])
      assert.equal(sha.length, 7)

      const commits = await getCommits(repo, 'HEAD', 5)
      assert.equal(commits[0].parentSHAs.length, 2)
      assert.equal(commits[0]!.shortSha, sha)
    })
  })

  describe('createMergeCommit', () => {
    describe('with a simple merge conflict', () => {
      describe('with a merge conflict', () => {
        it('creates a merge commit', async t => {
          const repository = await setupConflictedRepo(t)

          const status = await getStatusOrThrow(repository)
          const trackedFiles = status.workingDirectory.files.filter(
            f => f.status.kind !== AppFileStatusKind.Untracked
          )
          const sha = await createMergeCommit(repository, trackedFiles)
          const newStatus = await getStatusOrThrow(repository)
          assert.equal(sha.length, 7)
          assert.equal(newStatus.workingDirectory.files.length, 0)
        })
      })
    })

    describe('with a merge conflict and manual resolutions', () => {
      it('keeps files chosen to be added and commits', async t => {
        const repository = await setupConflictedRepoWithMultipleFiles(t)

        const status = await getStatusOrThrow(repository)
        const trackedFiles = status.workingDirectory.files.filter(
          f => f.status.kind !== AppFileStatusKind.Untracked
        )
        const manualResolutions = new Map([
          ['bar', ManualConflictResolution.ours],
        ])
        const sha = await createMergeCommit(
          repository,
          trackedFiles,
          manualResolutions
        )
        assert.equal(await pathExists(path.join(repository.path, 'bar')), true)
        const newStatus = await getStatusOrThrow(repository)
        assert.equal(sha.length, 7)
        assert.equal(newStatus.workingDirectory.files.length, 1)
      })

      it('deletes files chosen to be removed and commits', async t => {
        const repository = await setupConflictedRepoWithMultipleFiles(t)

        const status = await getStatusOrThrow(repository)
        const trackedFiles = status.workingDirectory.files.filter(
          f => f.status.kind !== AppFileStatusKind.Untracked
        )
        const manualResolutions = new Map([
          ['bar', ManualConflictResolution.theirs],
        ])
        const sha = await createMergeCommit(
          repository,
          trackedFiles,
          manualResolutions
        )
        assert.equal(await pathExists(path.join(repository.path, 'bar')), false)
        const newStatus = await getStatusOrThrow(repository)
        assert.equal(sha.length, 7)
        assert.equal(newStatus.workingDirectory.files.length, 1)
      })

      it('checks out our content for file added in both branches', async t => {
        const repository = await setupConflictedRepoWithMultipleFiles(t)

        const status = await getStatusOrThrow(repository)
        const trackedFiles = status.workingDirectory.files.filter(
          f => f.status.kind !== AppFileStatusKind.Untracked
        )
        const manualResolutions = new Map([
          ['baz', ManualConflictResolution.ours],
        ])
        const sha = await createMergeCommit(
          repository,
          trackedFiles,
          manualResolutions
        )
        assert.equal(
          await readFile(path.join(repository.path, 'baz'), 'utf8'),
          'b2'
        )
        const newStatus = await getStatusOrThrow(repository)
        assert.equal(sha.length, 7)
        assert.equal(newStatus.workingDirectory.files.length, 1)
      })

      it('checks out their content for file added in both branches', async t => {
        const repository = await setupConflictedRepoWithMultipleFiles(t)

        const status = await getStatusOrThrow(repository)
        const trackedFiles = status.workingDirectory.files.filter(
          f => f.status.kind !== AppFileStatusKind.Untracked
        )
        const manualResolutions = new Map([
          ['baz', ManualConflictResolution.theirs],
        ])
        const sha = await createMergeCommit(
          repository,
          trackedFiles,
          manualResolutions
        )
        assert.equal(
          await readFile(path.join(repository.path, 'baz'), 'utf8'),
          'b1'
        )
        const newStatus = await getStatusOrThrow(repository)
        assert.equal(sha.length, 7)
        assert.equal(newStatus.workingDirectory.files.length, 1)
      })

      describe('binary file conflicts', () => {
        const setup = async (t: TestContext) => {
          const repoPath = await setupFixtureRepository(
            t,
            'detect-conflict-in-binary-file'
          )
          const repository = new Repository(repoPath, -1, null, false)
          const fileName = 'my-cool-image.png'

          await exec(['checkout', 'master'], repoPath)

          const fileContentsTheirs = await readFile(
            path.join(repoPath, fileName),
            'utf8'
          )

          await exec(['checkout', 'make-a-change'], repoPath)

          const fileContentsOurs = await readFile(
            path.join(repoPath, fileName),
            'utf8'
          )

          return { repository, fileContentsTheirs, fileContentsOurs }
        }

        it('chooses `their` version of a file and commits', async t => {
          const { repository, fileContentsTheirs, fileContentsOurs } =
            await setup(t)

          await exec(['merge', 'master'], repository.path)

          const status = await getStatusOrThrow(repository)
          const files = status.workingDirectory.files
          assert.equal(files.length, 1)

          const file = files[0]
          assert.equal(file.status.kind, AppFileStatusKind.Conflicted)
          assert.equal(
            isConflictedFile(file.status) && isManualConflict(file.status),
            true
          )

          const trackedFiles = files.filter(
            f => f.status.kind !== AppFileStatusKind.Untracked
          )

          const manualResolutions = new Map([
            [file.path, ManualConflictResolution.theirs],
          ])
          await createMergeCommit(repository, trackedFiles, manualResolutions)

          const fileContents = await readFile(
            path.join(repository.path, file.path),
            'utf8'
          )

          assert.notEqual(fileContents, fileContentsOurs)
          assert.equal(fileContents, fileContentsTheirs)
        })

        it('chooses `our` version of a file and commits', async t => {
          const { repository, fileContentsOurs } = await setup(t)

          await exec(['merge', 'master'], repository.path)

          const status = await getStatusOrThrow(repository)
          const files = status.workingDirectory.files
          assert.equal(files.length, 1)

          const file = files[0]
          assert.equal(file.status.kind, AppFileStatusKind.Conflicted)
          assert.equal(
            isConflictedFile(file.status) && isManualConflict(file.status),
            true
          )

          const trackedFiles = files.filter(
            f => f.status.kind !== AppFileStatusKind.Untracked
          )

          const manualResolutions = new Map([
            [file.path, ManualConflictResolution.ours],
          ])
          await createMergeCommit(repository, trackedFiles, manualResolutions)

          const fileContents = await readFile(
            path.join(repository.path, file.path),
            'utf8'
          )

          assert.equal(fileContents, fileContentsOurs)
        })
      })
    })

    describe('with no changes', () => {
      it('throws an error', async t => {
        const repository = new Repository(
          await setupFixtureRepository(t, 'test-repo'),
          -1,
          null,
          false
        )
        const status = await getStatusOrThrow(repository)
        await assert.rejects(
          () => createMergeCommit(repository, status.workingDirectory.files),
          /There are no changes to commit./
        )
      })
    })
  })

  describe('index corner cases', () => {
    it('can commit when staged new file is then deleted', async t => {
      let status,
        files = null

      const repo = await setupEmptyRepository(t)

      const firstPath = path.join(repo.path, 'first')
      const secondPath = path.join(repo.path, 'second')

      await writeFile(firstPath, 'line1\n')
      await writeFile(secondPath, 'line2\n')

      await exec(['add', '.'], repo.path)

      await unlink(firstPath)

      status = await getStatusOrThrow(repo)
      files = status.workingDirectory.files

      assert.equal(files.length, 1)
      assert(files[0].path.includes('second'))
      assert.equal(files[0].status.kind, AppFileStatusKind.New)

      const toCommit = status.workingDirectory.withIncludeAllFiles(true)

      const sha = await createCommit(repo, 'commit everything', toCommit.files)
      assert.equal(sha, '(root-commit)')

      status = await getStatusOrThrow(repo)
      files = status.workingDirectory.files
      assert.equal(files.length, 0)

      const commit = await getCommit(repo, 'HEAD')
      assert(commit !== null)
      assert.equal(commit.summary, 'commit everything')
    })

    it('can commit when a delete is staged and the untracked file exists', async t => {
      let status,
        files = null

      const repo = await setupEmptyRepository(t)

      const firstPath = path.join(repo.path, 'first')
      await writeFile(firstPath, 'line1\n')

      await exec(['add', 'first'], repo.path)
      await exec(['commit', '-am', 'commit first file'], repo.path)
      await exec(['rm', '--cached', 'first'], repo.path)

      // if the text is now different, everything is fine
      await writeFile(firstPath, 'line2\n')

      status = await getStatusOrThrow(repo)
      files = status.workingDirectory.files

      assert.equal(files.length, 1)
      assert(files[0].path.includes('first'))
      assert.equal(files[0].status.kind, AppFileStatusKind.Untracked)

      const toCommit = status.workingDirectory.withIncludeAllFiles(true)

      const sha = await createCommit(repo, 'commit again!', toCommit.files)
      assert.equal(sha.length, 7)

      status = await getStatusOrThrow(repo)
      files = status.workingDirectory.files
      assert.equal(files.length, 0)

      const commit = await getCommit(repo, 'HEAD')
      assert(commit !== null)
      assert.equal(commit.summary, 'commit again!')
      assert.equal(commit.shortSha, sha)
    })

    it('file is deleted in index', async t => {
      const repo = await setupEmptyRepository(t)
      await writeFile(path.join(repo.path, 'secret'), 'contents\n')
      await writeFile(path.join(repo.path, '.gitignore'), '')

      // Setup repo to reproduce bug
      await exec(['add', '.'], repo.path)
      await exec(['commit', '-m', 'Initial commit'], repo.path)

      // Make changes that should remain secret
      await writeFile(path.join(repo.path, 'secret'), 'Somethign secret\n')

      // Ignore it
      await writeFile(path.join(repo.path, '.gitignore'), 'secret')

      // Remove from index to mark as deleted
      await exec(['rm', '--cached', 'secret'], repo.path)

      // Make sure that file is marked as deleted
      const beforeCommit = await getStatusOrThrow(repo)
      const files = beforeCommit.workingDirectory.files
      assert.equal(files.length, 2)
      assert.equal(files[1].status.kind, AppFileStatusKind.Deleted)

      // Commit changes
      await createCommit(repo, 'FAIL commit', files)
      const afterCommit = await getStatusOrThrow(repo)
      assert(afterCommit.currentTip !== undefined)
      assert.notEqual(beforeCommit.currentTip, afterCommit.currentTip)

      // Verify the file was delete in repo
      const changesetData = await getChangedFiles(repo, afterCommit.currentTip)
      assert.equal(changesetData.files.length, 2)
      assert.equal(
        changesetData.files[0].status.kind,
        AppFileStatusKind.Modified
      )
      assert.equal(
        changesetData.files[1].status.kind,
        AppFileStatusKind.Deleted
      )
    })
  })

  describe('createCommit allowEmpty', () => {
    it('creates an empty commit when allowEmpty is true', async t => {
      const repo = await setupEmptyRepository(t)

      // Create an initial commit so HEAD exists
      await writeFile(path.join(repo.path, 'file.txt'), 'content\n')
      const initialStatus = await getStatusOrThrow(repo)
      await createCommit(
        repo,
        'initial commit',
        initialStatus.workingDirectory.files
      )

      // Now create an empty commit with no file changes
      const tipBefore = (await getStatusOrThrow(repo)).currentTip
      const sha = await createCommit(repo, 'empty commit', [], {
        allowEmpty: true,
      })
      assert.equal(sha.length, 7)

      const tipAfter = (await getStatusOrThrow(repo)).currentTip
      assert.notEqual(tipBefore, tipAfter)

      const commit = await getCommit(repo, 'HEAD')
      assert(commit !== null)
      assert.equal(commit.summary, 'empty commit')
    })

    it('fails to create an empty commit when allowEmpty is not set', async t => {
      const repo = await setupEmptyRepository(t)

      // Create an initial commit so HEAD exists
      await writeFile(path.join(repo.path, 'file.txt'), 'content\n')
      const initialStatus = await getStatusOrThrow(repo)
      await createCommit(
        repo,
        'initial commit',
        initialStatus.workingDirectory.files
      )

      // Attempt to commit with no changes and no allowEmpty flag
      await assert.rejects(() => createCommit(repo, 'should fail', []))
    })
  })
})
