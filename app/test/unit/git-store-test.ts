/* tslint:disable:no-sync-functions */

import * as chai from 'chai'
const expect = chai.expect

import { setupEmptyRepository } from '../fixture-helper'
import * as Fs from 'fs'
import * as Path from 'path'

import { GitStore } from '../../src/lib/dispatcher/git-store'
import { FileStatus } from '../../src/models/status'
import { shell } from '../test-app-shell'

import {
  getStatus,
} from '../../src/lib/git'
import { GitProcess } from 'dugite'

describe('GitStore', () => {
  it('can discard changes from a repository', async () => {

    const repo = await setupEmptyRepository()
    const gitStore = new GitStore(repo, shell)

    const file = 'README.md'
    const filePath = Path.join(repo.path, file)

    Fs.writeFileSync(filePath, 'SOME WORDS GO HERE\n')

    // commit the file
    await GitProcess.exec([ 'add', file ], repo.path)
    await GitProcess.exec([ 'commit', '-m', 'added file' ], repo.path)

    Fs.writeFileSync(filePath, 'WRITING SOME NEW WORDS\n')

    // setup requires knowing about the current tip
    await gitStore.loadStatus()

    // ignore the file
    await gitStore.ignore(file)

    let status = await getStatus(repo)
    let files = status.workingDirectory.files

    expect(files.length).to.equal(2)
    expect(files[0].path).to.equal('README.md')
    expect(files[0].status).to.equal(FileStatus.Deleted)
    expect(files[1].path).to.equal('.gitignore')
    expect(files[1].status).to.equal(FileStatus.New)

    // discard the .gitignore change
    await gitStore.discardChanges([ files[1] ])

    // we should see the original file, modified
    status = await getStatus(repo)
    files = status.workingDirectory.files

    expect(files.length).to.equal(1)
    expect(files[0].path).to.equal('README.md')
    expect(files[0].status).to.equal(FileStatus.Modified)
  })

  it('can discard a renamed file', async () => {

    const repo = await setupEmptyRepository()
    const gitStore = new GitStore(repo, shell)

    const file = 'README.md'
    const renamedFile = 'NEW-README.md'
    const filePath = Path.join(repo.path, file)

    Fs.writeFileSync(filePath, 'SOME WORDS GO HERE\n')

    // commit the file, and then rename it
    await GitProcess.exec([ 'add', file ], repo.path)
    await GitProcess.exec([ 'commit', '-m', 'added file' ], repo.path)
    await GitProcess.exec([ 'mv', file, renamedFile ], repo.path)

    const statusBeforeDiscard = await getStatus(repo)
    const filesToDiscard = statusBeforeDiscard.workingDirectory.files

    // discard the renamed file
    await gitStore.discardChanges(filesToDiscard)

    const status = await getStatus(repo)
    const files = status.workingDirectory.files

    expect(files.length).to.equal(0)
  })
})
