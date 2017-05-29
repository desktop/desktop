/* tslint:disable:no-sync-functions */

import * as path from 'path'
import { expect } from 'chai'

import { Repository } from '../../../src/models/repository'
import { getStatus } from '../../../src/lib/git/status'
import { setupFixtureRepository, setupEmptyRepository } from '../../fixture-helper'
import { FileStatus } from '../../../src/models/status'
import { GitProcess } from 'dugite'

import * as fs from 'fs-extra'
const temp = require('temp').track()

describe('git/status', () => {

  let repository: Repository | null = null

  beforeEach(() => {
    const testRepoPath = setupFixtureRepository('test-repo')
    repository = new Repository(testRepoPath, -1, null, false)
  })

  after(() => {
    temp.cleanupSync()
  })

  describe('getStatus', () => {
    it('parses changed files', async () => {
      fs.writeFileSync(path.join(repository!.path, 'README.md'), 'Hi world\n')

      const status = await getStatus(repository!)
      const files = status.workingDirectory.files
      expect(files.length).to.equal(1)

      const file = files[0]
      expect(file.path).to.equal('README.md')
      expect(file.status).to.equal(FileStatus.Modified)
    })

    it('returns an empty array when there are no changes', async () => {
      const status = await getStatus(repository!)
      const files = status.workingDirectory.files
      expect(files.length).to.equal(0)
    })

    it('reflects renames', async () => {

      const repo = await setupEmptyRepository()

      fs.writeFileSync(path.join(repo.path, 'foo'), 'foo\n')

      await GitProcess.exec([ 'add', 'foo' ], repo.path)
      await GitProcess.exec([ 'commit', '-m', 'Initial commit' ], repo.path)
      await GitProcess.exec([ 'mv', 'foo', 'bar' ], repo.path)

      const status = await getStatus(repo)
      const files = status.workingDirectory.files

      expect(files.length).to.equal(1)
      expect(files[0].status).to.equal(FileStatus.Renamed)
      expect(files[0].oldPath).to.equal('foo')
      expect(files[0].path).to.equal('bar')
    })

    it('reflects copies', async () => {

      const testRepoPath = await setupFixtureRepository('copy-detection-status')
      repository = new Repository(testRepoPath, -1, null, false)

      await GitProcess.exec([ 'add', '.' ], repository.path)

      const status = await getStatus(repository)
      const files = status.workingDirectory.files

      expect(files.length).to.equal(2)

      expect(files[0].status).to.equal(FileStatus.Modified)
      expect(files[0].oldPath).to.be.undefined
      expect(files[0].path).to.equal('CONTRIBUTING.md')

      expect(files[1].status).to.equal(FileStatus.Copied)
      expect(files[1].oldPath).to.equal('CONTRIBUTING.md')
      expect(files[1].path).to.equal('docs/OVERVIEW.md')
    })
  })
})
