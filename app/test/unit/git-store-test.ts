import { expect } from 'chai'
import * as FSE from 'fs-extra'
import * as Path from 'path'
import { GitProcess } from 'dugite'

import { shell } from '../helpers/test-app-shell'
import {
  setupEmptyRepository,
  setupFixtureRepository,
  setupConflictedRepo,
} from '../helpers/repositories'
import { GitStore } from '../../src/lib/stores'
import { AppFileStatus } from '../../src/models/status'
import { Repository } from '../../src/models/repository'
import { Commit } from '../../src/models/commit'
import { TipState, IValidBranch } from '../../src/models/tip'
import { getCommit } from '../../src/lib/git'
import { getStatusOrThrow } from '../helpers/status'

describe('GitStore', () => {
  describe('loadCommitBatch', () => {
    it('includes HEAD when loading commits', async () => {
      const path = await setupFixtureRepository('repository-with-105-commits')
      const repo = new Repository(path, -1, null, false)
      const gitStore = new GitStore(repo, shell)

      const commits = await gitStore.loadCommitBatch('HEAD')

      expect(commits).is.not.null
      expect(commits!.length).equals(100)
      expect(commits![0]).equals('708a46eac512c7b2486da2247f116d11a100b611')
    })
  })

  it('can discard changes from a repository', async () => {
    const repo = await setupEmptyRepository()
    const gitStore = new GitStore(repo, shell)

    const readmeFile = 'README.md'
    const readmeFilePath = Path.join(repo.path, readmeFile)

    await FSE.writeFile(readmeFilePath, 'SOME WORDS GO HERE\n')

    const licenseFile = 'LICENSE.md'
    const licenseFilePath = Path.join(repo.path, licenseFile)

    await FSE.writeFile(licenseFilePath, 'SOME WORDS GO HERE\n')

    // commit the readme file but leave the license
    await GitProcess.exec(['add', readmeFile], repo.path)
    await GitProcess.exec(['commit', '-m', 'added readme file'], repo.path)

    await FSE.writeFile(readmeFilePath, 'WRITING SOME NEW WORDS\n')
    // setup requires knowing about the current tip
    await gitStore.loadStatus()

    let status = await getStatusOrThrow(repo)
    let files = status.workingDirectory.files

    expect(files.length).to.equal(2)
    expect(files[0].path).to.equal('README.md')
    expect(files[0].status).to.equal(AppFileStatus.Modified)

    // discard the LICENSE.md file
    await gitStore.discardChanges([files[1]])

    status = await getStatusOrThrow(repo)
    files = status.workingDirectory.files

    expect(files.length).to.equal(1)
  })

  it('can discard a renamed file', async () => {
    const repo = await setupEmptyRepository()
    const gitStore = new GitStore(repo, shell)

    const file = 'README.md'
    const renamedFile = 'NEW-README.md'
    const filePath = Path.join(repo.path, file)

    await FSE.writeFile(filePath, 'SOME WORDS GO HERE\n')

    // commit the file, and then rename it
    await GitProcess.exec(['add', file], repo.path)
    await GitProcess.exec(['commit', '-m', 'added file'], repo.path)
    await GitProcess.exec(['mv', file, renamedFile], repo.path)

    const statusBeforeDiscard = await getStatusOrThrow(repo)
    const filesToDiscard = statusBeforeDiscard.workingDirectory.files

    // discard the renamed file
    await gitStore.discardChanges(filesToDiscard)

    const status = await getStatusOrThrow(repo)
    const files = status.workingDirectory.files

    expect(files.length).to.equal(0)
  })

  describe('undo first commit', () => {
    let repo: Repository | null = null
    let firstCommit: Commit | null = null

    const commitMessage = 'added file'

    beforeEach(async () => {
      repo = await setupEmptyRepository()

      const file = 'README.md'
      const filePath = Path.join(repo.path, file)

      await FSE.writeFile(filePath, 'SOME WORDS GO HERE\n')

      await GitProcess.exec(['add', file], repo.path)
      await GitProcess.exec(['commit', '-m', commitMessage], repo.path)

      firstCommit = await getCommit(repo!, 'master')
      expect(firstCommit).to.not.equal(null)
      expect(firstCommit!.parentSHAs.length).to.equal(0)
    })

    it('reports the repository is unborn', async () => {
      const gitStore = new GitStore(repo!, shell)

      await gitStore.loadStatus()
      expect(gitStore.tip.kind).to.equal(TipState.Valid)

      await gitStore.undoCommit(firstCommit!)

      const after = await getStatusOrThrow(repo!)
      expect(after.currentTip).to.be.undefined
    })

    it('pre-fills the commit message', async () => {
      const gitStore = new GitStore(repo!, shell)

      await gitStore.undoCommit(firstCommit!)

      const context = gitStore.contextualCommitMessage
      expect(context).to.not.be.null
      expect(context!.summary).to.equal(commitMessage)
    })

    it('clears the undo commit dialog', async () => {
      const gitStore = new GitStore(repo!, shell)

      await gitStore.loadStatus()

      const tip = gitStore.tip as IValidBranch
      await gitStore.loadLocalCommits(tip.branch)

      expect(gitStore.localCommitSHAs.length).to.equal(1)

      await gitStore.undoCommit(firstCommit!)

      await gitStore.loadStatus()
      expect(gitStore.tip.kind).to.equal(TipState.Unborn)

      await gitStore.loadLocalCommits(null)

      expect(gitStore.localCommitSHAs).to.be.empty
    })

    it('has no staged files', async () => {
      const gitStore = new GitStore(repo!, shell)

      await gitStore.loadStatus()

      const tip = gitStore.tip as IValidBranch
      await gitStore.loadLocalCommits(tip.branch)

      expect(gitStore.localCommitSHAs.length).to.equal(1)

      await gitStore.undoCommit(firstCommit!)

      // compare the index state to some other tree-ish
      // 4b825dc642cb6eb9a060e54bf8d69288fbee4904 is the magic empty tree
      // if nothing is staged, this should return no entries
      const result = await GitProcess.exec(
        [
          'diff-index',
          '--name-status',
          '-z',
          '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
        ],
        repo!.path
      )
      expect(result.stdout.length).to.equal(0)
    })
  })

  it('hides commented out lines from MERGE_MSG', async () => {
    const repo = await setupConflictedRepo()
    const gitStore = new GitStore(repo, shell)

    await gitStore.loadContextualCommitMessage()

    const context = gitStore.contextualCommitMessage
    expect(context).to.not.be.null
    expect(context!.summary).to.equal(`Merge branch 'master' into other-branch`)
    expect(context!.description).to.be.null
  })

  describe('repository with HEAD file', () => {
    it('can discard modified change cleanly', async () => {
      const path = await setupFixtureRepository('repository-with-HEAD-file')
      const repo = new Repository(path, 1, null, false)
      const gitStore = new GitStore(repo, shell)

      const file = 'README.md'
      const filePath = Path.join(repo.path, file)

      await FSE.writeFile(filePath, 'SOME WORDS GO HERE\n')

      let status = await getStatusOrThrow(repo!)
      let files = status.workingDirectory.files
      expect(files.length).to.equal(1)

      await gitStore.discardChanges([files[0]])

      status = await getStatusOrThrow(repo)
      files = status.workingDirectory.files
      expect(files.length).to.equal(0)
    })
  })
})
