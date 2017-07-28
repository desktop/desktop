/* tslint:disable:no-sync-functions */

import * as chai from 'chai'
const expect = chai.expect

import { setupEmptyRepository, setupConflictedRepo } from '../fixture-helper'
import * as Fs from 'fs'
import * as Path from 'path'
import { GitProcess } from 'dugite'

import { GitStore } from '../../src/lib/dispatcher/git-store'
import { AppFileStatus } from '../../src/models/status'
import { Repository } from '../../src/models/repository'
import { Commit } from '../../src/models/commit'
import { TipState, IValidBranch } from '../../src/models/tip'

import { shell } from '../test-app-shell'

import { getCommit, getStatus } from '../../src/lib/git'

describe('GitStore', () => {
  it('can discard changes from a repository', async () => {
    const repo = await setupEmptyRepository()
    const gitStore = new GitStore(repo, shell)

    const readmeFile = 'README.md'
    const readmeFilePath = Path.join(repo.path, readmeFile)

    Fs.writeFileSync(readmeFilePath, 'SOME WORDS GO HERE\n')

    const licenseFile = 'LICENSE.md'
    const licenseFilePath = Path.join(repo.path, licenseFile)

    Fs.writeFileSync(licenseFilePath, 'SOME WORDS GO HERE\n')

    // commit the readme file but leave the license
    await GitProcess.exec(['add', readmeFile], repo.path)
    await GitProcess.exec(['commit', '-m', 'added readme file'], repo.path)

    Fs.writeFileSync(readmeFilePath, 'WRITING SOME NEW WORDS\n')

    // setup requires knowing about the current tip
    await gitStore.loadStatus()

    let status = await getStatus(repo)
    let files = status.workingDirectory.files

    expect(files.length).to.equal(2)
    expect(files[0].path).to.equal('README.md')
    expect(files[0].status).to.equal(AppFileStatus.Modified)
    expect(files[1].path).to.equal('LICENSE.md')
    expect(files[1].status).to.equal(AppFileStatus.New)

    // ignore the file
    await gitStore.ignore(licenseFile)

    status = await getStatus(repo)
    files = status.workingDirectory.files

    expect(files.length).to.equal(2)
    expect(files[0].path).to.equal('README.md')
    expect(files[0].status).to.equal(AppFileStatus.Modified)
    expect(files[1].path).to.equal('.gitignore')
    expect(files[1].status).to.equal(AppFileStatus.New)

    // discard the .gitignore change
    await gitStore.discardChanges([files[1]])

    // we should see the original file, modified
    status = await getStatus(repo)
    files = status.workingDirectory.files

    expect(files.length).to.equal(2)
    expect(files[0].path).to.equal('README.md')
    expect(files[0].status).to.equal(AppFileStatus.Modified)
    expect(files[1].path).to.equal('LICENSE.md')
    expect(files[1].status).to.equal(AppFileStatus.New)
  })

  it('can discard a renamed file', async () => {
    const repo = await setupEmptyRepository()
    const gitStore = new GitStore(repo, shell)

    const file = 'README.md'
    const renamedFile = 'NEW-README.md'
    const filePath = Path.join(repo.path, file)

    Fs.writeFileSync(filePath, 'SOME WORDS GO HERE\n')

    // commit the file, and then rename it
    await GitProcess.exec(['add', file], repo.path)
    await GitProcess.exec(['commit', '-m', 'added file'], repo.path)
    await GitProcess.exec(['mv', file, renamedFile], repo.path)

    const statusBeforeDiscard = await getStatus(repo)
    const filesToDiscard = statusBeforeDiscard.workingDirectory.files

    // discard the renamed file
    await gitStore.discardChanges(filesToDiscard)

    const status = await getStatus(repo)
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

      Fs.writeFileSync(filePath, 'SOME WORDS GO HERE\n')

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

      const after = await getStatus(repo!)

      expect(after).to.not.be.null
      expect(after!.currentTip).to.be.undefined
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
})
