/* eslint-disable no-sync */

import * as FS from 'fs'
import * as Path from 'path'
import { GitProcess } from 'dugite'
import { expect } from 'chai'

import { RepositorySettingsStore } from '../../src/lib/stores'
import { setupEmptyRepository } from '../helpers/repositories'
import { getStatus } from '../../src/lib/git'
import { Repository } from '../../src/models/repository'

describe('RepositorySettingsStore', () => {
  it('can create a gitignore file', async () => {
    const repo = await setupEmptyRepository()
    const sut = new RepositorySettingsStore(repo)
    const path = repo.path

    await sut.saveGitIgnore('node_modules\n')
    await GitProcess.exec(['add', '.gitignore'], path)
    await GitProcess.exec(['commit', '-m', 'create the ignore file'], path)

    await sut.saveGitIgnore('node_modules\n*.exe\n')
    await GitProcess.exec(['add', '.gitignore'], path)
    await GitProcess.exec(['commit', '-m', 'update the file'], path)

    const status = await getStatus(repo)
    const files = status.workingDirectory.files
    expect(files.length).to.equal(0)
  })

  it('respects config when updating', async () => {
    const repo = await setupEmptyRepository()
    const path = repo.path
    const sut = new RepositorySettingsStore(repo)

    // first pass - save a single entry
    await sut.saveGitIgnore('node_modules\n')
    await GitProcess.exec(['add', '.gitignore'], path)
    await GitProcess.exec(['commit', '-m', 'create the ignore file'], path)

    // second pass - update the file with a new entry
    await sut.saveGitIgnore('node_modules\n*.exe\n')
    await GitProcess.exec(['add', '.gitignore'], path)
    await GitProcess.exec(['commit', '-m', 'update the file'], path)

    const status = await getStatus(repo)
    const files = status.workingDirectory.files
    expect(files.length).to.equal(0)
  })

  it('can ignore a file in a repository', async () => {
    const repo = await setupEmptyRepository()
    const sut = new RepositorySettingsStore(repo)

    // ignore files
    await sut.ignore('*.ignore')
    await GitProcess.exec(['add', '.gitignore'], repo.path)
    await GitProcess.exec(['commit', '-m', 'add gitignore file'], repo.path)

    // commit the gitignore file

    const readmeFile = 'README.md'
    const readmeFilePath = Path.join(repo.path, readmeFile)

    FS.writeFileSync(readmeFilePath, 'SOME WORDS GO HERE\n')

    const fileToIgnore = 'GitJiggyWithIt.ignore'
    const fileToIgnorePath = Path.join(repo.path, fileToIgnore)

    FS.writeFileSync(fileToIgnorePath, 'Should be ignored\n')

    // commit the readme and gitignore file but leave the license
    await GitProcess.exec(['add', '.'], repo.path)
    await GitProcess.exec(['commit', '-m', 'add readme'], repo.path)
  })
})

describe('autocrlf and safecrlf', () => {
  let repo: Repository
  let sut: RepositorySettingsStore

  beforeEach(async () => {
    repo = await setupEmptyRepository()
    sut = new RepositorySettingsStore(repo)

    await GitProcess.exec(
      ['config', '--local', 'core.autocrlf', 'true'],
      repo.path
    )
    await GitProcess.exec(
      ['config', '--local', 'core.safecrlf', 'true'],
      repo.path
    )
  })

  it('appends newline to file', async () => {
    const path = repo.path

    await sut.saveGitIgnore('node_modules')
    await GitProcess.exec(['add', '.gitignore'], path)

    const commit = await GitProcess.exec(
      ['commit', '-m', 'create the ignore file'],
      path
    )
    const contents = await sut.readGitIgnore()

    expect(commit.exitCode).to.equal(0)
    expect(contents!.endsWith('\r\n'))
  })
})
