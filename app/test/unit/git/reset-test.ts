/* tslint:disable:no-sync-functions */

import * as path from 'path'
import { expect } from 'chai'

import { Repository } from '../../../src/models/repository'
import { resetPaths, GitResetMode } from '../../../src/lib/git/reset'
import { getStatus } from '../../../src/lib/git/status'
import { setupFixtureRepository } from '../../fixture-helper'
import { GitProcess } from 'dugite'

import * as fs from 'fs-extra'

describe('git/reset', () => {
  let repository: Repository | null = null

  beforeEach(() => {
    const testRepoPath = setupFixtureRepository('test-repo')
    repository = new Repository(testRepoPath, -1, null, false)
  })

  describe('resetPaths', () => {
    it('resets discarded staged file', async () => {
      const repoPath = repository!.path
      const fileName = 'README.md'
      const filePath = path.join(repoPath, fileName)

      // modify the file
      fs.writeFileSync(filePath, 'Hi world\n')

      // stage the file, then delete it to mimic discarding
      GitProcess.exec(['add', fileName], repoPath)
      fs.unlinkSync(filePath)

      await resetPaths(repository!, GitResetMode.Mixed, 'HEAD', [filePath])

      // then checkout the version from the index to restore it
      await GitProcess.exec(
        ['checkout-index', '-f', '-u', '-q', '--', fileName],
        repoPath
      )

      const status = await getStatus(repository!)
      expect(status.workingDirectory.files.length).to.equal(0)
    })
  })
})
