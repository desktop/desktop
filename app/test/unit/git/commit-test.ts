import * as path from 'path'
import * as FSE from 'fs-extra'

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
  expect(diff.kind === DiffType.Text)
  return diff as ITextDiff
}

describe('git/commit', () => {
  let repository: Repository

  beforeEach(async () => {
    const testRepoPath = await setupFixtureRepository('test-repo')
    repository = new Repository(testRepoPath, -1, null, false)
  })

  describe('createCommit normal', () => {
    it('commits the given files', async () => {
      await FSE.writeFile(path.join(repository.path, 'README.md'), 'Hi world\n')

      let status = await getStatusOrThrow(repository)
      let files = status.workingDirectory.files
      expect(files.length).toEqual(1)

      const sha = await createCommit(repository, 'Special commit', files)
      expect(sha).toHaveLength(7)

      status = await getStatusOrThrow(repository)
      files = status.workingDirectory.files
      expect(files.length).toEqual(0)

      const commits = await getCommits(repository, 'HEAD', 100)
      expect(commits.length).toEqual(6)
      expect(commits[0].summary).toEqual('Special commit')
      expect(commits[0].sha.substring(0, 7)).toEqual(sha)
    })

    it('commit does not strip commentary by default', async () => {
      await FSE.writeFile(path.join(repository.path, 'README.md'), 'Hi world\n')

      const status = await getStatusOrThrow(repository)
      const files = status.workingDirectory.files
      expect(files.length).toEqual(1)

      const message = `Special commit

# this is a comment`

      const sha = await createCommit(repository, message, files)
      expect(sha).toHaveLength(7)

      const commit = await getCommit(repository, 'HEAD')
      expect(commit).not.toBeNull()
      expect(commit!.summary).toEqual('Special commit')
      expect(commit!.body).toEqual('# this is a comment\n')
      expect(commit!.shortSha).toEqual(sha)
    })

    it('can commit for empty repository', async () => {
      const repo = await setupEmptyRepository()

      await FSE.writeFile(path.join(repo.path, 'foo'), 'foo\n')
      await FSE.writeFile(path.join(repo.path, 'bar'), 'bar\n')

      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files

      expect(files.length).toEqual(2)

      const allChanges = [
        files[0].withIncludeAll(true),
        files[1].withIncludeAll(true),
      ]

      const sha = await createCommit(
        repo,
        'added two files\n\nthis is a description',
        allChanges
      )
      expect(sha).toEqual('(root-commit)')

      const statusAfter = await getStatusOrThrow(repo)

      expect(statusAfter.workingDirectory.files.length).toEqual(0)

      const history = await getCommits(repo, 'HEAD', 2)

      expect(history.length).toEqual(1)
      expect(history[0].summary).toEqual('added two files')
      expect(history[0].body).toEqual('this is a description\n')
    })

    it('can commit renames', async () => {
      const repo = await setupEmptyRepository()

      await FSE.writeFile(path.join(repo.path, 'foo'), 'foo\n')

      await exec(['add', 'foo'], repo.path)
      await exec(['commit', '-m', 'Initial commit'], repo.path)
      await exec(['mv', 'foo', 'bar'], repo.path)

      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files

      expect(files.length).toEqual(1)

      const sha = await createCommit(repo, 'renamed a file', [
        files[0].withIncludeAll(true),
      ])
      expect(sha).toHaveLength(7)

      const statusAfter = await getStatusOrThrow(repo)

      expect(statusAfter.workingDirectory.files.length).toEqual(0)
    })
  })

  describe('createCommit partials', () => {
    beforeEach(async () => {
      const testRepoPath = await setupFixtureRepository('repo-with-changes')
      repository = new Repository(testRepoPath, -1, null, false)
    })

    it('can commit some lines from new file', async () => {
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
      expect(sha).toHaveLength(7)

      // verify that the HEAD of the repository has moved
      const newTip = (await getCommits(repository, 'HEAD', 1))[0]
      expect(newTip.sha).not.toEqual(previousTip.sha)
      expect(newTip.summary).toEqual('title')
      expect(newTip.shortSha).toEqual(sha)

      // verify that the contents of this new commit are just the new file
      const changesetData = await getChangedFiles(repository, newTip.sha)
      expect(changesetData.files.length).toEqual(1)
      expect(changesetData.files[0].path).toEqual(newFileName)

      // verify that changes remain for this new file
      const status = await getStatusOrThrow(repository)
      expect(status.workingDirectory.files.length).toEqual(4)

      // verify that the file is now tracked
      const fileChange = status!.workingDirectory.files.find(
        f => f.path === newFileName
      )
      expect(fileChange).not.toBeUndefined()
      expect(fileChange!.status.kind).toEqual(AppFileStatusKind.Modified)
    })

    it('can commit second hunk from modified file', async () => {
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
      expect(sha).toHaveLength(7)

      // verify that the HEAD of the repository has moved
      const newTip = (await getCommits(repository, 'HEAD', 1))[0]
      expect(newTip.sha).not.toEqual(previousTip.sha)
      expect(newTip.summary).toEqual('title')

      // verify that the contents of this new commit are just the modified file
      const changesetData = await getChangedFiles(repository, newTip.sha)
      expect(changesetData.files.length).toEqual(1)
      expect(changesetData.files[0].path).toEqual(modifiedFile)

      // verify that changes remain for this modified file
      const status = await getStatusOrThrow(repository)
      expect(status.workingDirectory.files.length).toEqual(4)

      // verify that the file is still marked as modified
      const fileChange = status.workingDirectory.files.find(
        f => f.path === modifiedFile
      )
      expect(fileChange).not.toBeUndefined()
      expect(fileChange!.status.kind).toEqual(AppFileStatusKind.Modified)
    })

    it('can commit single delete from modified file', async () => {
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
      expect(sha).toHaveLength(7)

      // verify that the HEAD of the repository has moved
      const newTip = (await getCommits(repository, 'HEAD', 1))[0]
      expect(newTip.sha).not.toEqual(previousTip.sha)
      expect(newTip.summary).toEqual('title')
      expect(newTip.shortSha).toEqual(sha)

      // verify that the contents of this new commit are just the modified file
      const changesetData = await getChangedFiles(repository, newTip.sha)
      expect(changesetData.files.length).toEqual(1)
      expect(changesetData.files[0].path).toEqual(fileName)
    })

    it('can commit multiple hunks from modified file', async () => {
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
      expect(sha).toHaveLength(7)

      // verify that the HEAD of the repository has moved
      const newTip = (await getCommits(repository, 'HEAD', 1))[0]
      expect(newTip.sha).not.toEqual(previousTip.sha)
      expect(newTip.summary).toEqual('title')
      expect(newTip.shortSha).toEqual(sha)

      // verify that the contents of this new commit are just the modified file
      const changesetData = await getChangedFiles(repository, newTip.sha)
      expect(changesetData.files.length).toEqual(1)
      expect(changesetData.files[0].path).toEqual(modifiedFile)

      // verify that changes remain for this modified file
      const status = await getStatusOrThrow(repository)
      expect(status.workingDirectory.files.length).toEqual(4)

      // verify that the file is still marked as modified
      const fileChange = status.workingDirectory.files.find(
        f => f.path === modifiedFile
      )
      expect(fileChange).not.toBeUndefined()
      expect(fileChange!.status.kind).toEqual(AppFileStatusKind.Modified)
    })

    it('can commit some lines from deleted file', async () => {
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
      expect(sha).toHaveLength(7)

      // verify that the HEAD of the repository has moved
      const newTip = (await getCommits(repository, 'HEAD', 1))[0]
      expect(newTip.sha).not.toEqual(previousTip.sha)
      expect(newTip.summary).toEqual('title')
      expect(newTip.sha.substring(0, 7)).toEqual(sha)

      // verify that the contents of this new commit are just the new file
      const changesetData = await getChangedFiles(repository, newTip.sha)
      expect(changesetData.files.length).toEqual(1)
      expect(changesetData.files[0].path).toEqual(deletedFile)

      // verify that changes remain for this new file
      const status = await getStatusOrThrow(repository)
      expect(status.workingDirectory.files.length).toEqual(4)

      // verify that the file is now tracked
      const fileChange = status.workingDirectory.files.find(
        f => f.path === deletedFile
      )
      expect(fileChange).not.toBeUndefined()
      expect(fileChange!.status.kind).toEqual(AppFileStatusKind.Deleted)
    })

    it('can commit renames with modifications', async () => {
      const repo = await setupEmptyRepository()

      await FSE.writeFile(path.join(repo.path, 'foo'), 'foo\n')

      await exec(['add', 'foo'], repo.path)
      await exec(['commit', '-m', 'Initial commit'], repo.path)
      await exec(['mv', 'foo', 'bar'], repo.path)

      await FSE.writeFile(path.join(repo.path, 'bar'), 'bar\n')

      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files

      expect(files.length).toEqual(1)

      const sha = await createCommit(repo, 'renamed a file', [
        files[0].withIncludeAll(true),
      ])
      expect(sha).toHaveLength(7)

      const statusAfter = await getStatusOrThrow(repo)

      expect(statusAfter.workingDirectory.files.length).toEqual(0)
      expect(statusAfter.currentTip!.substring(0, 7)).toEqual(sha)
    })

    // The scenario here is that the user has staged a rename (probably using git mv)
    // and then added some lines to the newly renamed file and they only want to
    // commit one of these lines.
    it('can commit renames with partially selected modifications', async () => {
      const repo = await setupEmptyRepository()

      await FSE.writeFile(path.join(repo.path, 'foo'), 'line1\n')

      await exec(['add', 'foo'], repo.path)
      await exec(['commit', '-m', 'Initial commit'], repo.path)
      await exec(['mv', 'foo', 'bar'], repo.path)

      await FSE.writeFile(path.join(repo.path, 'bar'), 'line1\nline2\nline3\n')

      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files

      expect(files.length).toEqual(1)
      expect(files[0].path).toContain('bar')
      expect(files[0].status.kind).toEqual(AppFileStatusKind.Renamed)

      const selection = files[0].selection
        .withSelectNone()
        .withLineSelection(2, true)

      const partiallySelectedFile = files[0].withSelection(selection)

      const sha = await createCommit(repo, 'renamed a file', [
        partiallySelectedFile,
      ])
      expect(sha).toHaveLength(7)

      const statusAfter = await getStatusOrThrow(repo)

      expect(statusAfter.workingDirectory.files.length).toEqual(1)

      const diff = await getTextDiff(
        repo,
        statusAfter.workingDirectory.files[0]
      )

      expect(diff.hunks.length).toEqual(1)
      expect(diff.hunks[0].lines.length).toEqual(4)
      expect(diff.hunks[0].lines[3].text).toEqual('+line3')
    })
  })

  describe('createCommit with a merge conflict', () => {
    it('creates a merge commit', async () => {
      const repo = await setupConflictedRepo()
      const filePath = path.join(repo.path, 'foo')

      const inMerge = await FSE.pathExists(
        path.join(repo.path, '.git', 'MERGE_HEAD')
      )
      expect(inMerge).toEqual(true)

      await FSE.writeFile(filePath, 'b1b2')

      const status = await getStatusOrThrow(repo)
      const files = status.workingDirectory.files

      expect(files.length).toEqual(1)
      expect(files[0].path).toEqual('foo')

      expect(files[0].status).toEqual({
        kind: AppFileStatusKind.Conflicted,
        entry: {
          kind: 'conflicted',
          action: UnmergedEntrySummary.BothModified,
          them: GitStatusEntry.UpdatedButUnmerged,
          us: GitStatusEntry.UpdatedButUnmerged,
        },
        conflictMarkerCount: 0,
      })

      const selection = files[0].selection.withSelectAll()
      const selectedFile = files[0].withSelection(selection)
      const sha = await createCommit(repo, 'Merge commit!', [selectedFile])
      expect(sha).toHaveLength(7)

      const commits = await getCommits(repo, 'HEAD', 5)
      expect(commits[0].parentSHAs.length).toEqual(2)
      expect(commits[0]!.shortSha).toEqual(sha)
    })
  })

  describe('createMergeCommit', () => {
    describe('with a simple merge conflict', () => {
      let repository: Repository
      describe('with a merge conflict', () => {
        beforeEach(async () => {
          repository = await setupConflictedRepo()
        })
        it('creates a merge commit', async () => {
          const status = await getStatusOrThrow(repository)
          const trackedFiles = status.workingDirectory.files.filter(
            f => f.status.kind !== AppFileStatusKind.Untracked
          )
          const sha = await createMergeCommit(repository, trackedFiles)
          const newStatus = await getStatusOrThrow(repository)
          expect(sha).toHaveLength(7)
          expect(newStatus.workingDirectory.files).toHaveLength(0)
        })
      })
    })

    describe('with a merge conflict and manual resolutions', () => {
      let repository: Repository
      beforeEach(async () => {
        repository = await setupConflictedRepoWithMultipleFiles()
      })
      it('keeps files chosen to be added and commits', async () => {
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
        expect(
          await FSE.pathExists(path.join(repository.path, 'bar'))
        ).toBeTrue()
        const newStatus = await getStatusOrThrow(repository)
        expect(sha).toHaveLength(7)
        expect(newStatus.workingDirectory.files).toHaveLength(1)
      })

      it('deletes files chosen to be removed and commits', async () => {
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
        expect(
          await FSE.pathExists(path.join(repository.path, 'bar'))
        ).toBeFalse()
        const newStatus = await getStatusOrThrow(repository)
        expect(sha).toHaveLength(7)
        expect(newStatus.workingDirectory.files).toHaveLength(1)
      })

      it('checks out our content for file added in both branches', async () => {
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
        expect(
          await FSE.readFile(path.join(repository.path, 'baz'), 'utf8')
        ).toEqual('b2')
        const newStatus = await getStatusOrThrow(repository)
        expect(sha).toHaveLength(7)
        expect(newStatus.workingDirectory.files).toHaveLength(1)
      })

      it('checks out their content for file added in both branches', async () => {
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
        expect(
          await FSE.readFile(path.join(repository.path, 'baz'), 'utf8')
        ).toEqual('b1')
        const newStatus = await getStatusOrThrow(repository)
        expect(sha).toHaveLength(7)
        expect(newStatus.workingDirectory.files).toHaveLength(1)
      })

      describe('binary file conflicts', () => {
        let fileName: string
        let fileContentsOurs: string, fileContentsTheirs: string
        beforeEach(async () => {
          const repoPath = await setupFixtureRepository(
            'detect-conflict-in-binary-file'
          )
          repository = new Repository(repoPath, -1, null, false)
          fileName = 'my-cool-image.png'

          await exec(['checkout', 'master'], repoPath)

          fileContentsTheirs = await FSE.readFile(
            path.join(repoPath, fileName),
            'utf8'
          )

          await exec(['checkout', 'make-a-change'], repoPath)

          fileContentsOurs = await FSE.readFile(
            path.join(repoPath, fileName),
            'utf8'
          )
        })

        it('chooses `their` version of a file and commits', async () => {
          const repo = repository

          await exec(['merge', 'master'], repo.path)

          const status = await getStatusOrThrow(repo)
          const files = status.workingDirectory.files
          expect(files).toHaveLength(1)

          const file = files[0]
          expect(file.status.kind).toBe(AppFileStatusKind.Conflicted)
          expect(
            isConflictedFile(file.status) && isManualConflict(file.status)
          ).toBe(true)

          const trackedFiles = files.filter(
            f => f.status.kind !== AppFileStatusKind.Untracked
          )

          const manualResolutions = new Map([
            [file.path, ManualConflictResolution.theirs],
          ])
          await createMergeCommit(repository, trackedFiles, manualResolutions)

          const fileContents = await FSE.readFile(
            path.join(repository.path, file.path),
            'utf8'
          )

          expect(fileContents).not.toStrictEqual(fileContentsOurs)
          expect(fileContents).toStrictEqual(fileContentsTheirs)
        })

        it('chooses `our` version of a file and commits', async () => {
          const repo = repository

          await exec(['merge', 'master'], repo.path)

          const status = await getStatusOrThrow(repo)
          const files = status.workingDirectory.files
          expect(files).toHaveLength(1)

          const file = files[0]
          expect(file.status.kind).toBe(AppFileStatusKind.Conflicted)
          expect(
            isConflictedFile(file.status) && isManualConflict(file.status)
          ).toBe(true)

          const trackedFiles = files.filter(
            f => f.status.kind !== AppFileStatusKind.Untracked
          )

          const manualResolutions = new Map([
            [file.path, ManualConflictResolution.ours],
          ])
          await createMergeCommit(repository, trackedFiles, manualResolutions)

          const fileContents = await FSE.readFile(
            path.join(repository.path, file.path),
            'utf8'
          )

          expect(fileContents).toStrictEqual(fileContentsOurs)
        })
      })
    })

    describe('with no changes', () => {
      let repository: Repository
      beforeEach(async () => {
        repository = new Repository(
          await setupFixtureRepository('test-repo'),
          -1,
          null,
          false
        )
      })
      it('throws an error', async () => {
        const status = await getStatusOrThrow(repository)
        expect(
          createMergeCommit(repository, status.workingDirectory.files)
        ).rejects.toThrow('There are no changes to commit.')
      })
    })
  })

  describe('index corner cases', () => {
    it('can commit when staged new file is then deleted', async () => {
      let status,
        files = null

      const repo = await setupEmptyRepository()

      const firstPath = path.join(repo.path, 'first')
      const secondPath = path.join(repo.path, 'second')

      await FSE.writeFile(firstPath, 'line1\n')
      await FSE.writeFile(secondPath, 'line2\n')

      await exec(['add', '.'], repo.path)

      await FSE.unlink(firstPath)

      status = await getStatusOrThrow(repo)
      files = status.workingDirectory.files

      expect(files.length).toEqual(1)
      expect(files[0].path).toContain('second')
      expect(files[0].status.kind).toEqual(AppFileStatusKind.New)

      const toCommit = status.workingDirectory.withIncludeAllFiles(true)

      const sha = await createCommit(repo, 'commit everything', toCommit.files)
      expect(sha).toEqual('(root-commit)')

      status = await getStatusOrThrow(repo)
      files = status.workingDirectory.files
      expect(files).toHaveLength(0)

      const commit = await getCommit(repo, 'HEAD')
      expect(commit).not.toBeNull()
      expect(commit!.summary).toEqual('commit everything')
    })

    it('can commit when a delete is staged and the untracked file exists', async () => {
      let status,
        files = null

      const repo = await setupEmptyRepository()

      const firstPath = path.join(repo.path, 'first')
      await FSE.writeFile(firstPath, 'line1\n')

      await exec(['add', 'first'], repo.path)
      await exec(['commit', '-am', 'commit first file'], repo.path)
      await exec(['rm', '--cached', 'first'], repo.path)

      // if the text is now different, everything is fine
      await FSE.writeFile(firstPath, 'line2\n')

      status = await getStatusOrThrow(repo)
      files = status.workingDirectory.files

      expect(files.length).toEqual(1)
      expect(files[0].path).toContain('first')
      expect(files[0].status.kind).toEqual(AppFileStatusKind.Untracked)

      const toCommit = status!.workingDirectory.withIncludeAllFiles(true)

      const sha = await createCommit(repo, 'commit again!', toCommit.files)
      expect(sha).toHaveLength(7)

      status = await getStatusOrThrow(repo)
      files = status.workingDirectory.files
      expect(files).toHaveLength(0)

      const commit = await getCommit(repo, 'HEAD')
      expect(commit).not.toBeNull()
      expect(commit!.summary).toEqual('commit again!')
      expect(commit!.shortSha).toEqual(sha)
    })

    it('file is deleted in index', async () => {
      const repo = await setupEmptyRepository()
      await FSE.writeFile(path.join(repo.path, 'secret'), 'contents\n')
      await FSE.writeFile(path.join(repo.path, '.gitignore'), '')

      // Setup repo to reproduce bug
      await exec(['add', '.'], repo.path)
      await exec(['commit', '-m', 'Initial commit'], repo.path)

      // Make changes that should remain secret
      await FSE.writeFile(path.join(repo.path, 'secret'), 'Somethign secret\n')

      // Ignore it
      await FSE.writeFile(path.join(repo.path, '.gitignore'), 'secret')

      // Remove from index to mark as deleted
      await exec(['rm', '--cached', 'secret'], repo.path)

      // Make sure that file is marked as deleted
      const beforeCommit = await getStatusOrThrow(repo)
      const files = beforeCommit.workingDirectory.files
      expect(files.length).toBe(2)
      expect(files[1].status.kind).toBe(AppFileStatusKind.Deleted)

      // Commit changes
      await createCommit(repo!, 'FAIL commit', files)
      const afterCommit = await getStatusOrThrow(repo)
      expect(beforeCommit.currentTip).not.toBe(afterCommit.currentTip)

      // Verify the file was delete in repo
      const changesetData = await getChangedFiles(repo, afterCommit.currentTip!)
      expect(changesetData.files.length).toBe(2)
      expect(changesetData.files[0].status.kind).toBe(
        AppFileStatusKind.Modified
      )
      expect(changesetData.files[1].status.kind).toBe(AppFileStatusKind.Deleted)
    })
  })
})
