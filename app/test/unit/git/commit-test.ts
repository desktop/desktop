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
} from '../../helpers/repositories'

import { GitProcess } from 'dugite'
import {
  WorkingDirectoryFileChange,
  AppFileStatusKind,
  UnmergedEntrySummary,
  GitStatusEntry,
} from '../../../src/models/status'
import {
  DiffSelectionType,
  DiffSelection,
  ITextDiff,
  DiffType,
} from '../../../src/models/diff'
import { getStatusOrThrow } from '../../helpers/status'

async function getTextDiff(
  repo: Repository,
  file: WorkingDirectoryFileChange
): Promise<ITextDiff> {
  const diff = await getWorkingDirectoryDiff(repo, file)
  expect(diff.kind === DiffType.Text)
  return diff as ITextDiff
}

describe('git/commit', () => {
  let repository: Repository | null = null

  beforeEach(async () => {
    const testRepoPath = await setupFixtureRepository('test-repo')
    repository = new Repository(testRepoPath, -1, null, false)
  })

  describe('createCommit normal', () => {
    it('commits the given files', async () => {
      await FSE.writeFile(
        path.join(repository!.path, 'README.md'),
        'Hi world\n'
      )

      let status = await getStatusOrThrow(repository!)
      let files = status.workingDirectory.files
      expect(files.length).toEqual(1)

      const sha = await createCommit(repository!, 'Special commit', files)
      expect(sha).toHaveLength(7)

      status = await getStatusOrThrow(repository!)
      files = status.workingDirectory.files
      expect(files.length).toEqual(0)

      const commits = await getCommits(repository!, 'HEAD', 100)
      expect(commits.length).toEqual(6)
      expect(commits[0].summary).toEqual('Special commit')
      expect(commits[0].sha.substring(0, 7)).toEqual(sha)
    })

    it('commit does not strip commentary by default', async () => {
      await FSE.writeFile(
        path.join(repository!.path, 'README.md'),
        'Hi world\n'
      )

      const status = await getStatusOrThrow(repository!)
      const files = status.workingDirectory.files
      expect(files.length).toEqual(1)

      const message = `Special commit

# this is a comment`

      const sha = await createCommit(repository!, message, files)
      expect(sha).toHaveLength(7)

      const commit = await getCommit(repository!, 'HEAD')
      expect(commit).not.toBeNull()
      expect(commit!.summary).toEqual('Special commit')
      expect(commit!.body).toEqual('# this is a comment\n')
      expect(commit!.sha.substring(0, 7)).toEqual(sha)
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

      await GitProcess.exec(['add', 'foo'], repo.path)
      await GitProcess.exec(['commit', '-m', 'Initial commit'], repo.path)
      await GitProcess.exec(['mv', 'foo', 'bar'], repo.path)

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
      const previousTip = (await getCommits(repository!, 'HEAD', 1))[0]

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
      const sha = await createCommit(repository!, 'title', [file])
      expect(sha).toHaveLength(7)

      // verify that the HEAD of the repository has moved
      const newTip = (await getCommits(repository!, 'HEAD', 1))[0]
      expect(newTip.sha).not.toEqual(previousTip.sha)
      expect(newTip.summary).toEqual('title')
      expect(newTip.sha.substring(0, 7)).toEqual(sha)

      // verify that the contents of this new commit are just the new file
      const changedFiles = await getChangedFiles(repository!, newTip.sha)
      expect(changedFiles.length).toEqual(1)
      expect(changedFiles[0].path).toEqual(newFileName)

      // verify that changes remain for this new file
      const status = await getStatusOrThrow(repository!)
      expect(status.workingDirectory.files.length).toEqual(4)

      // verify that the file is now tracked
      const fileChange = status!.workingDirectory.files.find(
        f => f.path === newFileName
      )
      expect(fileChange).not.toBeUndefined()
      expect(fileChange!.status.kind).toEqual(AppFileStatusKind.Modified)
    })

    it('can commit second hunk from modified file', async () => {
      const previousTip = (await getCommits(repository!, 'HEAD', 1))[0]

      const modifiedFile = 'modified-file.md'

      const unselectedFile = DiffSelection.fromInitialSelection(
        DiffSelectionType.None
      )
      const file = new WorkingDirectoryFileChange(
        modifiedFile,
        { kind: AppFileStatusKind.Modified },
        unselectedFile
      )

      const diff = await getTextDiff(repository!, file)

      const selection = DiffSelection.fromInitialSelection(
        DiffSelectionType.All
      ).withRangeSelection(
        diff.hunks[0].unifiedDiffStart,
        diff.hunks[0].unifiedDiffEnd - diff.hunks[0].unifiedDiffStart,
        false
      )

      const updatedFile = file.withSelection(selection)

      // commit just this change, ignore everything else
      const sha = await createCommit(repository!, 'title', [updatedFile])
      expect(sha).toHaveLength(7)

      // verify that the HEAD of the repository has moved
      const newTip = (await getCommits(repository!, 'HEAD', 1))[0]
      expect(newTip.sha).not.toEqual(previousTip.sha)
      expect(newTip.summary).toEqual('title')

      // verify that the contents of this new commit are just the modified file
      const changedFiles = await getChangedFiles(repository!, newTip.sha)
      expect(changedFiles.length).toEqual(1)
      expect(changedFiles[0].path).toEqual(modifiedFile)

      // verify that changes remain for this modified file
      const status = await getStatusOrThrow(repository!)
      expect(status.workingDirectory.files.length).toEqual(4)

      // verify that the file is still marked as modified
      const fileChange = status.workingDirectory.files.find(
        f => f.path === modifiedFile
      )
      expect(fileChange).not.toBeUndefined()
      expect(fileChange!.status.kind).toEqual(AppFileStatusKind.Modified)
    })

    it('can commit single delete from modified file', async () => {
      const previousTip = (await getCommits(repository!, 'HEAD', 1))[0]

      const fileName = 'modified-file.md'

      const unselectedFile = DiffSelection.fromInitialSelection(
        DiffSelectionType.None
      )
      const modifiedFile = new WorkingDirectoryFileChange(
        fileName,
        { kind: AppFileStatusKind.Modified },
        unselectedFile
      )

      const diff = await getTextDiff(repository!, modifiedFile)

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
      const sha = await createCommit(repository!, 'title', [file])
      expect(sha).toHaveLength(7)

      // verify that the HEAD of the repository has moved
      const newTip = (await getCommits(repository!, 'HEAD', 1))[0]
      expect(newTip.sha).not.toEqual(previousTip.sha)
      expect(newTip.summary).toEqual('title')
      expect(newTip.sha.substring(0, 7)).toEqual(sha)

      // verify that the contents of this new commit are just the modified file
      const changedFiles = await getChangedFiles(repository!, newTip.sha)
      expect(changedFiles.length).toEqual(1)
      expect(changedFiles[0].path).toEqual(fileName)
    })

    it('can commit multiple hunks from modified file', async () => {
      const previousTip = (await getCommits(repository!, 'HEAD', 1))[0]

      const modifiedFile = 'modified-file.md'

      const unselectedFile = DiffSelection.fromInitialSelection(
        DiffSelectionType.None
      )
      const file = new WorkingDirectoryFileChange(
        modifiedFile,
        { kind: AppFileStatusKind.Modified },
        unselectedFile
      )

      const diff = await getTextDiff(repository!, file)

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
      const sha = await createCommit(repository!, 'title', [updatedFile])
      expect(sha).toHaveLength(7)

      // verify that the HEAD of the repository has moved
      const newTip = (await getCommits(repository!, 'HEAD', 1))[0]
      expect(newTip.sha).not.toEqual(previousTip.sha)
      expect(newTip.summary).toEqual('title')
      expect(newTip.sha.substring(0, 7)).toEqual(sha)

      // verify that the contents of this new commit are just the modified file
      const changedFiles = await getChangedFiles(repository!, newTip.sha)
      expect(changedFiles.length).toEqual(1)
      expect(changedFiles[0].path).toEqual(modifiedFile)

      // verify that changes remain for this modified file
      const status = await getStatusOrThrow(repository!)
      expect(status.workingDirectory.files.length).toEqual(4)

      // verify that the file is still marked as modified
      const fileChange = status.workingDirectory.files.find(
        f => f.path === modifiedFile
      )
      expect(fileChange).not.toBeUndefined()
      expect(fileChange!.status.kind).toEqual(AppFileStatusKind.Modified)
    })

    it('can commit some lines from deleted file', async () => {
      const previousTip = (await getCommits(repository!, 'HEAD', 1))[0]

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
      const sha = await createCommit(repository!, 'title', [file])
      expect(sha).toHaveLength(7)

      // verify that the HEAD of the repository has moved
      const newTip = (await getCommits(repository!, 'HEAD', 1))[0]
      expect(newTip.sha).not.toEqual(previousTip.sha)
      expect(newTip.summary).toEqual('title')
      expect(newTip.sha.substring(0, 7)).toEqual(sha)

      // verify that the contents of this new commit are just the new file
      const changedFiles = await getChangedFiles(repository!, newTip.sha)
      expect(changedFiles.length).toEqual(1)
      expect(changedFiles[0].path).toEqual(deletedFile)

      // verify that changes remain for this new file
      const status = await getStatusOrThrow(repository!)
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

      await GitProcess.exec(['add', 'foo'], repo.path)
      await GitProcess.exec(['commit', '-m', 'Initial commit'], repo.path)
      await GitProcess.exec(['mv', 'foo', 'bar'], repo.path)

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

      await GitProcess.exec(['add', 'foo'], repo.path)
      await GitProcess.exec(['commit', '-m', 'Initial commit'], repo.path)
      await GitProcess.exec(['mv', 'foo', 'bar'], repo.path)

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
      expect(commits[0]!.sha.substring(0, 7)).toEqual(sha)
    })
  })

  describe('createMergeCommit with a merge conflict', () => {
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
    describe('with no changes', () => {
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
        ).rejects.toThrow(/Commit failed/i)
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

      await GitProcess.exec(['add', '.'], repo.path)

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

      await GitProcess.exec(['add', 'first'], repo.path)
      await GitProcess.exec(['commit', '-am', 'commit first file'], repo.path)
      await GitProcess.exec(['rm', '--cached', 'first'], repo.path)

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
      expect(commit!.sha.substring(0, 7)).toEqual(sha)
    })
  })
})
