/* tslint:disable:no-sync-functions */

import * as path from 'path'
import { expect } from 'chai'

import { Repository } from '../../../src/models/repository'
import {
  getStatus,
  createCommit,
  getCommits,
  getCommit,
  getChangedFiles,
  getWorkingDirectoryDiff,
} from '../../../src/lib/git'

import {
  setupFixtureRepository,
  setupEmptyRepository,
  setupConflictedRepo,
} from '../../fixture-helper'

import { GitProcess } from 'dugite'
import { FileStatus, WorkingDirectoryFileChange } from '../../../src/models/status'
import { DiffSelectionType, DiffSelection, ITextDiff, DiffType } from '../../../src/models/diff'

import * as fs from 'fs-extra'
const temp = require('temp').track()

async function getTextDiff(repo: Repository, file: WorkingDirectoryFileChange): Promise<ITextDiff> {
  const diff = await getWorkingDirectoryDiff(repo, file)
  expect(diff.kind === DiffType.Text)
  return diff as ITextDiff
}

describe('git/commit', () => {

  let repository: Repository | null = null

  beforeEach(() => {
    const testRepoPath = setupFixtureRepository('test-repo')
    repository = new Repository(testRepoPath, -1, null, false)
  })

  after(() => {
    temp.cleanupSync()
  })

  describe('createCommit normal', () => {
    it('commits the given files', async () => {
      fs.writeFileSync(path.join(repository!.path, 'README.md'), 'Hi world\n')

      let status = await getStatus(repository!)
      let files = status.workingDirectory.files
      expect(files.length).to.equal(1)

      await createCommit(repository!, 'Special commit', files)

      status = await getStatus(repository!)
      files = status.workingDirectory.files
      expect(files.length).to.equal(0)

      const commits = await getCommits(repository!, 'HEAD', 100)
      expect(commits.length).to.equal(6)
      expect(commits[0].summary).to.equal('Special commit')
    })

    it('commit does not strip commentary by default', async () => {
      fs.writeFileSync(path.join(repository!.path, 'README.md'), 'Hi world\n')

      const status = await getStatus(repository!)
      const files = status.workingDirectory.files
      expect(files.length).to.equal(1)

      const message = `Special commit

# this is a comment`

      await createCommit(repository!, message, files)

      const commit = await getCommit(repository!, 'HEAD')
      expect(commit).to.not.be.null
      expect(commit!.summary).to.equal('Special commit')
      expect(commit!.body).to.equal('# this is a comment\n')
    })

    it('can commit for empty repository', async () => {

      const repo = await setupEmptyRepository()

      fs.writeFileSync(path.join(repo.path, 'foo'), 'foo\n')
      fs.writeFileSync(path.join(repo.path, 'bar'), 'bar\n')

      const status = await getStatus(repo)
      const files = status.workingDirectory.files

      expect(files.length).to.equal(2)

      const allChanges = [ files[0].withIncludeAll(true), files[1].withIncludeAll(true) ]

      await createCommit(repo, 'added two files\n\nthis is a description', allChanges)

      const statusAfter = await getStatus(repo)

      expect(statusAfter.workingDirectory.files.length).to.equal(0)

      const history = await getCommits(repo, 'HEAD', 2)

      expect(history.length).to.equal(1)
      expect(history[0].summary).to.equal('added two files')
      expect(history[0].body).to.equal('this is a description\n')
    })

    it('can commit renames', async () => {

      const repo = await setupEmptyRepository()

      fs.writeFileSync(path.join(repo.path, 'foo'), 'foo\n')

      await GitProcess.exec([ 'add', 'foo' ], repo.path)
      await GitProcess.exec([ 'commit', '-m', 'Initial commit' ], repo.path)
      await GitProcess.exec([ 'mv', 'foo', 'bar' ], repo.path)

      const status = await getStatus(repo)
      const files = status.workingDirectory.files

      expect(files.length).to.equal(1)

      await createCommit(repo, 'renamed a file', [ files[0].withIncludeAll(true) ])

      const statusAfter = await getStatus(repo)

      expect(statusAfter.workingDirectory.files.length).to.equal(0)
    })
  })

  describe('createCommit partials', () => {

    beforeEach(() => {
      const testRepoPath = setupFixtureRepository('repo-with-changes')
      repository = new Repository(testRepoPath, -1, null, false)
    })

    it('can commit some lines from new file', async () => {
      const previousTip = (await getCommits(repository!, 'HEAD', 1))[0]

      const newFileName = 'new-file.md'

      // select first five lines of file
      const selection = DiffSelection
        .fromInitialSelection(DiffSelectionType.None)
        .withRangeSelection(0, 5, true)

      const file = new WorkingDirectoryFileChange(newFileName, FileStatus.New, selection)

      // commit just this change, ignore everything else
      await createCommit(repository!, 'title', [ file ])

      // verify that the HEAD of the repository has moved
      const newTip = (await getCommits(repository!, 'HEAD', 1))[0]
      expect(newTip.sha).to.not.equal(previousTip.sha)
      expect(newTip.summary).to.equal('title')

      // verify that the contents of this new commit are just the new file
      const changedFiles = await getChangedFiles(repository!, newTip.sha)
      expect(changedFiles.length).to.equal(1)
      expect(changedFiles[0].path).to.equal(newFileName)

      // verify that changes remain for this new file
      const status = await getStatus(repository!)
      expect(status.workingDirectory.files.length).to.equal(4)

      // verify that the file is now tracked
      const fileChange = status.workingDirectory.files.find(f => f.path === newFileName)
      expect(fileChange).to.not.be.undefined
      expect(fileChange!.status).to.equal(FileStatus.Modified)
    })

    it('can commit second hunk from modified file', async () => {

      const previousTip = (await getCommits(repository!, 'HEAD', 1))[0]

      const modifiedFile = 'modified-file.md'

      const unselectedFile = DiffSelection.fromInitialSelection(DiffSelectionType.None)
      const file = new WorkingDirectoryFileChange(modifiedFile, FileStatus.Modified, unselectedFile)

      const diff = await getTextDiff(repository!, file)

      const selection = DiffSelection
        .fromInitialSelection(DiffSelectionType.All)
        .withRangeSelection(diff.hunks[0].unifiedDiffStart, diff.hunks[0].unifiedDiffEnd - diff.hunks[0].unifiedDiffStart, false)

      const updatedFile = file.withSelection(selection)

      // commit just this change, ignore everything else
      await createCommit(repository!, 'title', [ updatedFile ])

      // verify that the HEAD of the repository has moved
      const newTip = (await getCommits(repository!, 'HEAD', 1))[0]
      expect(newTip.sha).to.not.equal(previousTip.sha)
      expect(newTip.summary).to.equal('title')

      // verify that the contents of this new commit are just the modified file
      const changedFiles = await getChangedFiles(repository!, newTip.sha)
      expect(changedFiles.length).to.equal(1)
      expect(changedFiles[0].path).to.equal(modifiedFile)

      // verify that changes remain for this modified file
      const status = await getStatus(repository!)
      expect(status.workingDirectory.files.length).to.equal(4)

      // verify that the file is still marked as modified
      const fileChange = status.workingDirectory.files.find(f => f.path === modifiedFile)
      expect(fileChange).to.not.be.undefined
      expect(fileChange!.status).to.equal(FileStatus.Modified)
    })

    it('can commit single delete from modified file', async () => {
      const previousTip = (await getCommits(repository!, 'HEAD', 1))[0]

      const fileName = 'modified-file.md'

      const unselectedFile = DiffSelection.fromInitialSelection(DiffSelectionType.None)
      const modifiedFile = new WorkingDirectoryFileChange(fileName, FileStatus.Modified, unselectedFile)

      const diff = await getTextDiff(repository!, modifiedFile)

      const secondRemovedLine = diff.hunks[0].unifiedDiffStart + 5

      const selection = DiffSelection
        .fromInitialSelection(DiffSelectionType.None)
        .withRangeSelection(secondRemovedLine, 1, true)

      const file = new WorkingDirectoryFileChange(fileName, FileStatus.Modified, selection)

      // commit just this change, ignore everything else
      await createCommit(repository!, 'title', [ file ])

      // verify that the HEAD of the repository has moved
      const newTip = (await getCommits(repository!, 'HEAD', 1))[0]
      expect(newTip.sha).to.not.equal(previousTip.sha)
      expect(newTip.summary).to.equal('title')

      // verify that the contents of this new commit are just the modified file
      const changedFiles = await getChangedFiles(repository!, newTip.sha)
      expect(changedFiles.length).to.equal(1)
      expect(changedFiles[0].path).to.equal(fileName)
    })

    it('can commit multiple hunks from modified file', async () => {

      const previousTip = (await getCommits(repository!, 'HEAD', 1))[0]

      const modifiedFile = 'modified-file.md'

      const unselectedFile = DiffSelection.fromInitialSelection(DiffSelectionType.None)
      const file = new WorkingDirectoryFileChange(modifiedFile, FileStatus.Modified, unselectedFile)

      const diff = await getTextDiff(repository!, file)

      const selection = DiffSelection
        .fromInitialSelection(DiffSelectionType.All)
        .withRangeSelection(diff.hunks[1].unifiedDiffStart, diff.hunks[1].unifiedDiffEnd - diff.hunks[1].unifiedDiffStart, false)

      const updatedFile = new WorkingDirectoryFileChange(modifiedFile, FileStatus.Modified, selection)

      // commit just this change, ignore everything else
      await createCommit(repository!, 'title', [ updatedFile ])

      // verify that the HEAD of the repository has moved
      const newTip = (await getCommits(repository!, 'HEAD', 1))[0]
      expect(newTip.sha).to.not.equal(previousTip.sha)
      expect(newTip.summary).to.equal('title')

      // verify that the contents of this new commit are just the modified file
      const changedFiles = await getChangedFiles(repository!, newTip.sha)
      expect(changedFiles.length).to.equal(1)
      expect(changedFiles[0].path).to.equal(modifiedFile)

      // verify that changes remain for this modified file
      const status = await getStatus(repository!)
      expect(status.workingDirectory.files.length).to.equal(4)

      // verify that the file is still marked as modified
      const fileChange = status.workingDirectory.files.find(f => f.path === modifiedFile)
      expect(fileChange).to.not.be.undefined
      expect(fileChange!.status).to.equal(FileStatus.Modified)
    })

    it('can commit some lines from deleted file', async () => {
      const previousTip = (await getCommits(repository!, 'HEAD', 1))[0]

      const deletedFile = 'deleted-file.md'

      const selection = DiffSelection
        .fromInitialSelection(DiffSelectionType.None)
        .withRangeSelection(0, 5, true)

      const file = new WorkingDirectoryFileChange(deletedFile, FileStatus.Deleted, selection)

      // commit just this change, ignore everything else
      await createCommit(repository!, 'title', [ file ])

      // verify that the HEAD of the repository has moved
      const newTip = (await getCommits(repository!, 'HEAD', 1))[0]
      expect(newTip.sha).to.not.equal(previousTip.sha)
      expect(newTip.summary).to.equal('title')

      // verify that the contents of this new commit are just the new file
      const changedFiles = await getChangedFiles(repository!, newTip.sha)
      expect(changedFiles.length).to.equal(1)
      expect(changedFiles[0].path).to.equal(deletedFile)

      // verify that changes remain for this new file
      const status = await getStatus(repository!)
      expect(status.workingDirectory.files.length).to.equal(4)

      // verify that the file is now tracked
      const fileChange = status.workingDirectory.files.find(f => f.path === deletedFile)
      expect(fileChange).to.not.be.undefined
      expect(fileChange!.status).to.equal(FileStatus.Deleted)
    })

    it('can commit renames with modifications', async () => {
      const repo = await setupEmptyRepository()

      fs.writeFileSync(path.join(repo.path, 'foo'), 'foo\n')

      await GitProcess.exec([ 'add', 'foo' ], repo.path)
      await GitProcess.exec([ 'commit', '-m', 'Initial commit' ], repo.path)
      await GitProcess.exec([ 'mv', 'foo', 'bar' ], repo.path)

      fs.writeFileSync(path.join(repo.path, 'bar'), 'bar\n')

      const status = await getStatus(repo)
      const files = status.workingDirectory.files

      expect(files.length).to.equal(1)

      await createCommit(repo, 'renamed a file', [ files[0].withIncludeAll(true) ])

      const statusAfter = await getStatus(repo)

      expect(statusAfter.workingDirectory.files.length).to.equal(0)
    })

    // The scenario here is that the user has staged a rename (probably using git mv)
    // and then added some lines to the newly renamed file and they only want to
    // commit one of these lines.
    it('can commit renames with partially selected modifications', async () => {

      const repo = await setupEmptyRepository()

      fs.writeFileSync(path.join(repo.path, 'foo'), 'line1\n')

      await GitProcess.exec([ 'add', 'foo' ], repo.path)
      await GitProcess.exec([ 'commit', '-m', 'Initial commit' ], repo.path)
      await GitProcess.exec([ 'mv', 'foo', 'bar' ], repo.path)

      fs.writeFileSync(path.join(repo.path, 'bar'), 'line1\nline2\nline3\n')

      const status = await getStatus(repo)
      const files = status.workingDirectory.files

      expect(files.length).to.equal(1)
      expect(files[0].path).to.contain('bar')
      expect(files[0].status).to.equal(FileStatus.Renamed)

      const selection = files[0].selection
        .withSelectNone()
        .withLineSelection(2, true)

      const partiallySelectedFile = files[0].withSelection(selection)

      await createCommit(repo, 'renamed a file', [ partiallySelectedFile ])

      const statusAfter = await getStatus(repo)

      expect(statusAfter.workingDirectory.files.length).to.equal(1)

      const diff = await getTextDiff(repo, statusAfter.workingDirectory.files[0])

      expect(diff.hunks.length).to.equal(1)
      expect(diff.hunks[0].lines.length).to.equal(4)
      expect(diff.hunks[0].lines[3].text).to.equal('+line3')
    })
  })

  describe('createCommit with a merge conflict', () => {
    it('creates a merge commit', async () => {
      const repo = await setupConflictedRepo()
      const filePath = path.join(repo.path, 'foo')

      const inMerge = fs.existsSync(path.join(repo.path, '.git', 'MERGE_HEAD'))
      expect(inMerge).to.equal(true)

      fs.writeFileSync(filePath, 'b1b2')

      const status = await getStatus(repo)
      const files = status.workingDirectory.files

      expect(files.length).to.equal(1)
      expect(files[0].path).to.equal('foo')
      expect(files[0].status).to.equal(FileStatus.Conflicted)

      const selection = files[0].selection.withSelectAll()
      const selectedFile = files[0].withSelection(selection)
      await createCommit(repo, 'Merge commit!', [ selectedFile ])

      const commits = await getCommits(repo, 'HEAD', 5)
      expect(commits[0].parentSHAs.length).to.equal(2)
    })
  })
})
