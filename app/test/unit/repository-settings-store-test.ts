import * as FSE from 'fs-extra'
import * as Path from 'path'
import { GitProcess } from 'dugite'
import { expect } from 'chai'

import { RepositorySettingsStore } from '../../src/lib/stores'
import { setupEmptyRepository } from '../helpers/repositories'
import { getStatusOrThrow } from '../helpers/status'

describe('RepositorySettingsStore', () => {
  it('can create a gitignore file', async () => {
    const repo = await setupEmptyRepository()
    const path = repo.path
    const sut = new RepositorySettingsStore(repo)

    // Create git ignore file
    await sut.saveGitIgnore('node_modules\n')

    // Make sure file exists on FS
    const exists = await FSE.pathExists(`${path}/.gitignore`)

    expect(exists).is.true
  })

  it('deletes gitignore file when no entries provided', async () => {
    const repo = await setupEmptyRepository()
    const path = repo.path

    const ignoreFile = `${path}/.gitignore`
    await FSE.writeFile(ignoreFile, 'node_modules\n')

    const sut = new RepositorySettingsStore(repo)

    // update gitignore file to be empty
    await sut.saveGitIgnore('')

    const exists = await FSE.pathExists(ignoreFile)
    expect(exists).is.false
  })

  it('can ignore a file in a repository', async () => {
    const repo = await setupEmptyRepository()
    const sut = new RepositorySettingsStore(repo)
    const path = repo.path

    // Ignore txt files
    await sut.saveGitIgnore('*.txt\n')
    await GitProcess.exec(['add', '.gitignore'], path)
    await GitProcess.exec(['commit', '-m', 'create the ignore file'], path)

    // Create a txt file
    const file = Path.join(repo.path, 'a.txt')

    await FSE.writeFile(file, 'thrvbnmerkl;,iuw')

    // Check status of repo
    const status = await getStatusOrThrow(repo)
    const files = status.workingDirectory.files

    expect(files.length).to.equal(0)
  })

  describe('autocrlf and safecrlf are true', () => {
    it('appends CRLF to file', async () => {
      const repo = await setupEmptyRepository()
      const sut = new RepositorySettingsStore(repo)

      await GitProcess.exec(
        ['config', '--local', 'core.autocrlf', 'true'],
        repo.path
      )
      await GitProcess.exec(
        ['config', '--local', 'core.safecrlf', 'true'],
        repo.path
      )

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

  describe('autocrlf and safecrlf are unset', () => {
    it('appends LF to file', async () => {
      const repo = await setupEmptyRepository()
      const sut = new RepositorySettingsStore(repo)

      // ensure this repository only ever sticks to LF
      await GitProcess.exec(['config', '--local', 'core.eol', 'lf'], repo.path)

      // do not do any conversion of line endings when committing
      await GitProcess.exec(
        ['config', '--local', 'core.autocrlf', 'input'],
        repo.path
      )

      const path = repo.path

      await sut.saveGitIgnore('node_modules')
      await GitProcess.exec(['add', '.gitignore'], path)

      const commit = await GitProcess.exec(
        ['commit', '-m', 'create the ignore file'],
        path
      )
      const contents = await sut.readGitIgnore()

      expect(commit.exitCode).to.equal(0)
      expect(contents!.endsWith('\n'))
    })
  })
})
