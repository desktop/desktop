import * as chai from 'chai'
const expect = chai.expect

import * as path from 'path'

const fs = require('fs-extra')
const temp = require('temp').track()

import { Repository } from '../../src/models/repository'
import { LocalGitOperations, BranchType } from '../../src/lib/local-git-operations'
import { getWorkingDirectoryDiff } from '../../src/lib/git/git-diff'
import { FileStatus, WorkingDirectoryFileChange } from '../../src/models/status'
import { DiffSelectionType, DiffSelection } from '../../src/models/diff'
import { setupFixtureRepository, setupEmptyRepository } from '../fixture-helper'

import { GitProcess } from 'git-kitchen-sink'

describe('LocalGitOperations', () => {
  let repository: Repository | null = null

  beforeEach(() => {
    const testRepoPath = setupFixtureRepository('test-repo')
    repository = new Repository(testRepoPath, -1, null)
  })

  after(() => {
    temp.cleanupSync()
  })

  describe('status', () => {
    it('parses changed files', async () => {
      fs.writeFileSync(path.join(repository!.path, 'README.md'), 'Hi world\n')

      const status = await LocalGitOperations.getStatus(repository!)
      const files = status.workingDirectory.files
      expect(files.length).to.equal(1)

      const file = files[0]
      expect(file.path).to.equal('README.md')
      expect(file.status).to.equal(FileStatus.Modified)
    })

    it('returns an empty array when there are no changes', async () => {
      const status = await LocalGitOperations.getStatus(repository!)
      const files = status.workingDirectory.files
      expect(files.length).to.equal(0)
    })

    it('reflects renames', async () => {

      const repo = await setupEmptyRepository()

      fs.writeFileSync(path.join(repo.path, 'foo'), 'foo\n')

      await GitProcess.exec([ 'add', 'foo' ], repo.path)
      await GitProcess.exec([ 'commit', '-m', 'Initial commit' ], repo.path)
      await GitProcess.exec([ 'mv', 'foo', 'bar' ], repo.path)

      const status = await LocalGitOperations.getStatus(repo)
      const files = status.workingDirectory.files

      expect(files.length).to.equal(1)
      expect(files[0].status).to.equal(FileStatus.Renamed)
      expect(files[0].oldPath).to.equal('foo')
      expect(files[0].path).to.equal('bar')
    })
  })

  describe('committing', () => {
    it('commits the given files', async () => {
      fs.writeFileSync(path.join(repository!.path, 'README.md'), 'Hi world\n')

      let status = await LocalGitOperations.getStatus(repository!)
      let files = status.workingDirectory.files
      expect(files.length).to.equal(1)

      await LocalGitOperations.createCommit(repository!, 'Special commit', files)

      status = await LocalGitOperations.getStatus(repository!)
      files = status.workingDirectory.files
      expect(files.length).to.equal(0)

      const commits = await LocalGitOperations.getCommits(repository!, 'HEAD', 100)
      expect(commits.length).to.equal(6)
      expect(commits[0].summary).to.equal('Special commit')
    })

    it('can commit for empty repository', async () => {

      const repo = await setupEmptyRepository()

      fs.writeFileSync(path.join(repo.path, 'foo'), 'foo\n')
      fs.writeFileSync(path.join(repo.path, 'bar'), 'bar\n')

      const status = await LocalGitOperations.getStatus(repo)
      const files = status.workingDirectory.files

      expect(files.length).to.equal(2)

      const allChanges = [ files[0].withIncludeAll(true), files[1].withIncludeAll(true) ]

      await LocalGitOperations.createCommit(repo, 'added two files\n\nthis is a description', allChanges)

      const statusAfter = await LocalGitOperations.getStatus(repo)

      expect(statusAfter.workingDirectory.files.length).to.equal(0)

      const history = await LocalGitOperations.getCommits(repo, 'HEAD', 2)

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

      const status = await LocalGitOperations.getStatus(repo)
      const files = status.workingDirectory.files

      expect(files.length).to.equal(1)

      await LocalGitOperations.createCommit(repo, 'renamed a file', [ files[0].withIncludeAll(true) ])

      const statusAfter = await LocalGitOperations.getStatus(repo)

      expect(statusAfter.workingDirectory.files.length).to.equal(0)
    })
  })

  describe('partial commits', () => {

    beforeEach(() => {
      const testRepoPath = setupFixtureRepository('repo-with-changes')
      repository = new Repository(testRepoPath, -1, null)
    })

    it('can commit some lines from new file', async () => {
      const previousTip = (await LocalGitOperations.getCommits(repository!, 'HEAD', 1))[0]

      const newFileName = 'new-file.md'

      // select first five lines of file
      const selection = DiffSelection
        .fromInitialSelection(DiffSelectionType.None)
        .withRangeSelection(0, 5, true)

      const file = new WorkingDirectoryFileChange(newFileName, FileStatus.New, selection)

      // commit just this change, ignore everything else
      await LocalGitOperations.createCommit(repository!, 'title', [ file ])

      // verify that the HEAD of the repository has moved
      const newTip = (await LocalGitOperations.getCommits(repository!, 'HEAD', 1))[0]
      expect(newTip.sha).to.not.equal(previousTip.sha)
      expect(newTip.summary).to.equal('title')

      // verify that the contents of this new commit are just the new file
      const changedFiles = await LocalGitOperations.getChangedFiles(repository!, newTip.sha)
      expect(changedFiles.length).to.equal(1)
      expect(changedFiles[0].path).to.equal(newFileName)

      // verify that changes remain for this new file
      const status = await LocalGitOperations.getStatus(repository!)
      expect(status.workingDirectory.files.length).to.equal(4)

      // verify that the file is now tracked
      const fileChange = status.workingDirectory.files.find(f => f.path === newFileName)
      expect(fileChange).to.not.be.undefined
      expect(fileChange!.status).to.equal(FileStatus.Modified)
    })

    it('can commit second hunk from modified file', async () => {

      const previousTip = (await LocalGitOperations.getCommits(repository!, 'HEAD', 1))[0]

      const modifiedFile = 'modified-file.md'

      const unselectedFile = DiffSelection.fromInitialSelection(DiffSelectionType.None)
      const file = new WorkingDirectoryFileChange(modifiedFile, FileStatus.Modified, unselectedFile)

      const diff = await getWorkingDirectoryDiff(repository!, file)

      const selection = DiffSelection
        .fromInitialSelection(DiffSelectionType.All)
        .withRangeSelection(diff.hunks[0].unifiedDiffStart, diff.hunks[0].unifiedDiffEnd - diff.hunks[0].unifiedDiffStart, false)

      const updatedFile = file.withSelection(selection)

      // commit just this change, ignore everything else
      await LocalGitOperations.createCommit(repository!, 'title', [ updatedFile ])

      // verify that the HEAD of the repository has moved
      const newTip = (await LocalGitOperations.getCommits(repository!, 'HEAD', 1))[0]
      expect(newTip.sha).to.not.equal(previousTip.sha)
      expect(newTip.summary).to.equal('title')

      // verify that the contents of this new commit are just the modified file
      const changedFiles = await LocalGitOperations.getChangedFiles(repository!, newTip.sha)
      expect(changedFiles.length).to.equal(1)
      expect(changedFiles[0].path).to.equal(modifiedFile)

      // verify that changes remain for this modified file
      const status = await LocalGitOperations.getStatus(repository!)
      expect(status.workingDirectory.files.length).to.equal(4)

      // verify that the file is still marked as modified
      const fileChange = status.workingDirectory.files.find(f => f.path === modifiedFile)
      expect(fileChange).to.not.be.undefined
      expect(fileChange!.status).to.equal(FileStatus.Modified)
    })

    it('can commit single delete from modified file', async () => {
      const previousTip = (await LocalGitOperations.getCommits(repository!, 'HEAD', 1))[0]

      const fileName = 'modified-file.md'

      const unselectedFile = DiffSelection.fromInitialSelection(DiffSelectionType.None)
      const modifiedFile = new WorkingDirectoryFileChange(fileName, FileStatus.Modified, unselectedFile)

      const diff = await getWorkingDirectoryDiff(repository!, modifiedFile)

      const secondRemovedLine = diff.hunks[0].unifiedDiffStart + 5

      const selection = DiffSelection
        .fromInitialSelection(DiffSelectionType.None)
        .withRangeSelection(secondRemovedLine, 1, true)

      const file = new WorkingDirectoryFileChange(fileName, FileStatus.Modified, selection)

      // commit just this change, ignore everything else
      await LocalGitOperations.createCommit(repository!, 'title', [ file ])

      // verify that the HEAD of the repository has moved
      const newTip = (await LocalGitOperations.getCommits(repository!, 'HEAD', 1))[0]
      expect(newTip.sha).to.not.equal(previousTip.sha)
      expect(newTip.summary).to.equal('title')

      // verify that the contents of this new commit are just the modified file
      const changedFiles = await LocalGitOperations.getChangedFiles(repository!, newTip.sha)
      expect(changedFiles.length).to.equal(1)
      expect(changedFiles[0].path).to.equal(fileName)
    })

    it('can commit multiple hunks from modified file', async () => {

      const previousTip = (await LocalGitOperations.getCommits(repository!, 'HEAD', 1))[0]

      const modifiedFile = 'modified-file.md'

      const unselectedFile = DiffSelection.fromInitialSelection(DiffSelectionType.None)
      const file = new WorkingDirectoryFileChange(modifiedFile, FileStatus.Modified, unselectedFile)

      const diff = await getWorkingDirectoryDiff(repository!, file)

      const selection = DiffSelection
        .fromInitialSelection(DiffSelectionType.All)
        .withRangeSelection(diff.hunks[1].unifiedDiffStart, diff.hunks[1].unifiedDiffEnd - diff.hunks[1].unifiedDiffStart, false)

      const updatedFile = new WorkingDirectoryFileChange(modifiedFile, FileStatus.Modified, selection)

      // commit just this change, ignore everything else
      await LocalGitOperations.createCommit(repository!, 'title', [ updatedFile ])

      // verify that the HEAD of the repository has moved
      const newTip = (await LocalGitOperations.getCommits(repository!, 'HEAD', 1))[0]
      expect(newTip.sha).to.not.equal(previousTip.sha)
      expect(newTip.summary).to.equal('title')

      // verify that the contents of this new commit are just the modified file
      const changedFiles = await LocalGitOperations.getChangedFiles(repository!, newTip.sha)
      expect(changedFiles.length).to.equal(1)
      expect(changedFiles[0].path).to.equal(modifiedFile)

      // verify that changes remain for this modified file
      const status = await LocalGitOperations.getStatus(repository!)
      expect(status.workingDirectory.files.length).to.equal(4)

      // verify that the file is still marked as modified
      const fileChange = status.workingDirectory.files.find(f => f.path === modifiedFile)
      expect(fileChange).to.not.be.undefined
      expect(fileChange!.status).to.equal(FileStatus.Modified)
    })

    it('can commit some lines from deleted file', async () => {
      const previousTip = (await LocalGitOperations.getCommits(repository!, 'HEAD', 1))[0]

      const deletedFile = 'deleted-file.md'

      const selection = DiffSelection
        .fromInitialSelection(DiffSelectionType.None)
        .withRangeSelection(0, 5, true)

      const file = new WorkingDirectoryFileChange(deletedFile, FileStatus.Deleted, selection)

      // commit just this change, ignore everything else
      await LocalGitOperations.createCommit(repository!, 'title', [ file ])

      // verify that the HEAD of the repository has moved
      const newTip = (await LocalGitOperations.getCommits(repository!, 'HEAD', 1))[0]
      expect(newTip.sha).to.not.equal(previousTip.sha)
      expect(newTip.summary).to.equal('title')

      // verify that the contents of this new commit are just the new file
      const changedFiles = await LocalGitOperations.getChangedFiles(repository!, newTip.sha)
      expect(changedFiles.length).to.equal(1)
      expect(changedFiles[0].path).to.equal(deletedFile)

      // verify that changes remain for this new file
      const status = await LocalGitOperations.getStatus(repository!)
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

      const status = await LocalGitOperations.getStatus(repo)
      const files = status.workingDirectory.files

      expect(files.length).to.equal(1)

      await LocalGitOperations.createCommit(repo, 'renamed a file', [ files[0].withIncludeAll(true) ])

      const statusAfter = await LocalGitOperations.getStatus(repo)

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

      const status = await LocalGitOperations.getStatus(repo)
      const files = status.workingDirectory.files

      expect(files.length).to.equal(1)
      expect(files[0].path).to.contain('bar')
      expect(files[0].status).to.equal(FileStatus.Renamed)

      const selection = files[0].selection
        .withSelectNone()
        .withLineSelection(2, true)

      const partiallySelectedFile = files[0].withSelection(selection)

      await LocalGitOperations.createCommit(repo, 'renamed a file', [ partiallySelectedFile ])

      const statusAfter = await LocalGitOperations.getStatus(repo)

      expect(statusAfter.workingDirectory.files.length).to.equal(1)

      const diff = await getWorkingDirectoryDiff(repo, statusAfter.workingDirectory.files[0])

      expect(diff.hunks.length).to.equal(1)
      expect(diff.hunks[0].lines.length).to.equal(4)
      expect(diff.hunks[0].lines[3].text).to.equal('+line3')
    })
  })

  describe('history', () => {
    it('loads history', async () => {
      const commits = await LocalGitOperations.getCommits(repository!, 'HEAD', 100)
      expect(commits.length).to.equal(5)

      const firstCommit = commits[commits.length - 1]
      expect(firstCommit.summary).to.equal('first')
      expect(firstCommit.sha).to.equal('7cd6640e5b6ca8dbfd0b33d0281ebe702127079c')
    })

    describe('changed files', () => {
      it('loads the files changed in the commit', async () => {
        const files = await LocalGitOperations.getChangedFiles(repository!, '7cd6640e5b6ca8dbfd0b33d0281ebe702127079c')
        expect(files.length).to.equal(1)
        expect(files[0].path).to.equal('README.md')
        expect(files[0].status).to.equal(FileStatus.New)
      })

      it('detects renames', async () => {
        const testRepoPath = setupFixtureRepository('rename-history-detection')
        repository = new Repository(testRepoPath, -1, null)

        const first = await LocalGitOperations.getChangedFiles(repository, '55bdecb')
        expect(first.length).to.equal(1)
        expect(first[0].status).to.equal(FileStatus.Renamed)
        expect(first[0].oldPath).to.equal('NEW.md')
        expect(first[0].path).to.equal('NEWER.md')

        const second = await LocalGitOperations.getChangedFiles(repository, 'c898ca8')
        expect(second.length).to.equal(1)
        expect(second[0].status).to.equal(FileStatus.Renamed)
        expect(second[0].oldPath).to.equal('OLD.md')
        expect(second[0].path).to.equal('NEW.md')
      })

      it('detect copies', async () => {
        const testRepoPath = setupFixtureRepository('copies-history-detection')
        repository = new Repository(testRepoPath, -1, null)

        // ensure the test repository is configured to detect copies
        await GitProcess.exec([ 'config', 'diff.renames', 'copies' ], repository.path)

        const files = await LocalGitOperations.getChangedFiles(repository, 'a500bf415')
        expect(files.length).to.equal(2)

        expect(files[0].status).to.equal(FileStatus.Copied)
        expect(files[0].oldPath).to.equal('initial.md')
        expect(files[0].path).to.equal('duplicate-with-edits.md')

        expect(files[1].status).to.equal(FileStatus.Copied)
        expect(files[1].oldPath).to.equal('initial.md')
        expect(files[1].path).to.equal('duplicate.md')
      })
    })
  })

  describe('config', () => {
    it('looks up config values', async () => {
      const bare = await LocalGitOperations.getConfigValue(repository!, 'core.bare')
      expect(bare).to.equal('false')
    })

    it('returns null for undefined values', async () => {
      const value = await LocalGitOperations.getConfigValue(repository!, 'core.the-meaning-of-life')
      expect(value).to.equal(null)
    })
  })

  describe('branches', () => {
    describe('current branch', () => {
      it('should get the current branch', async () => {
        const branch = await LocalGitOperations.getCurrentBranch(repository!)
        expect(branch!.name).to.equal('master')
        expect(branch!.upstream).to.equal(null)
        expect(branch!.tip).to.be.not.null
        expect(branch!.tip.sha).to.equal('04c7629c588c74659f03dda5e5fb3dd8d6862dfa')
        expect(branch!.type).to.equal(BranchType.Local)
      })

      it('should return null for empty repo', async () => {
        const repo = await setupEmptyRepository()
        const branch = await LocalGitOperations.getCurrentBranch(repo)
        expect(branch).to.be.null
      })
    })

    describe('all branches', () => {
      it('should list all branches', async () => {
        const branches = await LocalGitOperations.getBranches(repository!, 'refs/heads', BranchType.Local)
        expect(branches.length).to.equal(1)
        expect(branches[0].name).to.equal('master')
        expect(branches[0].upstream).to.equal(null)
        expect(branches[0].type).to.equal(BranchType.Local)
        expect(branches[0].tip.sha).to.equal('04c7629c588c74659f03dda5e5fb3dd8d6862dfa')
      })

      it('should return empty list for empty repo', async () => {
        const repo = await setupEmptyRepository()
        const branches = await LocalGitOperations.getBranches(repo, '', BranchType.Local)
        expect(branches.length).to.equal(0)
      })
    })
  })

  describe('isGitRepository', () => {
    it('should return true for a repository', async () => {
      const result = await LocalGitOperations.isGitRepository(repository!.path)
      expect(result).to.equal(true)
    })

    it('should return false for a directory', async () => {
      const result = await LocalGitOperations.isGitRepository(path.dirname(repository!.path))
      expect(result).to.equal(false)
    })
  })

  describe('getGitDir', () => {
    it('should return the git dir path for a repository', async () => {
      const result = await LocalGitOperations.getGitDir(repository!.path)
      expect(result).to.equal(path.join(repository!.path, '.git'))
    })

    it('should return null for a directory', async () => {
      const result = await LocalGitOperations.getGitDir(path.dirname(repository!.path))
      expect(result).to.equal(null)
    })
  })
})
