/* tslint:disable:no-sync-functions */

import * as path from 'path'
import * as Fs from 'fs'
import * as os from 'os'
import { expect } from 'chai'

import { Repository } from '../../../src/models/repository'
import { isGitRepository, getTopLevelWorkingDirectory } from '../../../src/lib/git/rev-parse'
import { git } from '../../../src/lib/git/core'
import { setupFixtureRepository } from '../../fixture-helper'

const temp = require('temp').track()

describe('git/rev-parse', () => {

  let repository: Repository | null = null

  beforeEach(() => {
    const testRepoPath = setupFixtureRepository('test-repo')
    repository = new Repository(testRepoPath, -1, null, false)
  })

  after(() => {
    temp.cleanupSync()
  })

  describe('isGitRepository', () => {
    it('should return true for a repository', async () => {
      const result = await isGitRepository(repository!.path)
      expect(result).to.equal(true)
    })

    it('should return false for a directory', async () => {
      const result = await isGitRepository(path.dirname(repository!.path))
      expect(result).to.equal(false)
    })
  })

  describe('getTopLevelWorkingDirectory', () => {
    it('should return an absolute path when run inside a working directory', async () => {
      const result = await getTopLevelWorkingDirectory(repository!.path)
      expect(result).to.equal(repository!.path)

      const subdirPath = path.join(repository!.path, 'subdir')

      await new Promise<void>((resolve, reject) => {
        Fs.mkdir(subdirPath, e => e ? reject(e) : resolve())
      })

      const subDirResult = await getTopLevelWorkingDirectory(repository!.path)
      expect(subDirResult).to.equal(repository!.path)
    })

    it('should return null when not run inside a working directory', async () => {
      const result = await getTopLevelWorkingDirectory(os.tmpdir())
      expect(result).to.be.null
    })

    it('should resolve top level directory run inside the .git folder', async () => {
      const p = path.join(repository!.path, '.git')
      const result = await getTopLevelWorkingDirectory(p)
      expect(result).to.equal(p)
    })


    it('should return correct path for submodules', async () => {

      const fixturePath = temp.mkdirSync('get-top-level-working-directory-test-')

      const firstRepoPath = path.join(fixturePath, 'repo1')
      const secondRepoPath = path.join(fixturePath, 'repo2')

      await git([ 'init', 'repo1' ], fixturePath, '')
      await git([ 'init', 'repo2' ], fixturePath, '')
      await git([ 'config' , 'user.name', 'Cai Hsu' ], secondRepoPath, '')
      await git([ 'config' , 'user.email', 'cai.hsu@not-a-real-site.com' ], secondRepoPath, '')

      await git([ 'commit', '--allow-empty', '-m', 'Initial commit' ], secondRepoPath, '')
      await git([ 'submodule', 'add', '../repo2' ], firstRepoPath, '')

      let result = await getTopLevelWorkingDirectory(firstRepoPath)
      expect(result).to.equal(firstRepoPath)

      const subModulePath = path.join(firstRepoPath, 'repo2')
      result = await getTopLevelWorkingDirectory(subModulePath)
      expect(result).to.equal(subModulePath)
    })
  })
})
