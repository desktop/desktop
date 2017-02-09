import * as chai from 'chai'
const expect = chai.expect

import { setupEmptyRepository } from '../fixture-helper'
import * as Fs from 'fs'
import * as Path from 'path'

import { GitStore } from '../../src/lib/dispatcher/git-store'
import { FileStatus } from '../../src/models/status'
import { TestAppShell } from '../test-app-shell'

import {
  getStatus,
} from '../../src/lib/git'
import { GitProcess } from 'git-kitchen-sink'

describe('GitStore', () => {
  it('can discard changes from a repository', async () => {

    const testShell = new TestAppShell()

    const repo = await setupEmptyRepository()
    const gitStore = new GitStore(repo, testShell)

    const file = 'README.md'
    const filePath = Path.join(repo.path, file)

    Fs.writeFileSync(filePath, 'SOME WORDS GO HERE\n')

    // commit the file
    await GitProcess.exec([ 'add', file ], repo.path)
    await GitProcess.exec([ 'commit', '-m', 'added file' ], repo.path)

    Fs.writeFileSync(filePath, 'WRITING SOME NEW WORDS\n')

    // setup requires knowing about the current tip
    await gitStore.loadCurrentAndDefaultBranch()

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
})
