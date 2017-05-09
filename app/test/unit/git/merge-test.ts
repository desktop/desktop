/* tslint:disable:no-sync-functions */

import * as path from 'path'
import { expect } from 'chai'

import { mergeExists } from '../../../src/lib/git'

import { setupEmptyRepository } from '../../fixture-helper'
import { GitProcess } from 'dugite'

import * as fs from 'fs-extra'

describe('git/merge', () => {
  describe('mergeExists', () => {
    it('detects a merge conflict', async () => {
      const repo = await setupEmptyRepository()
      const filePath = path.join(repo.path, 'foo')

      fs.writeFileSync(filePath, '')
      await GitProcess.exec([ 'add', 'foo' ], repo.path)
      await GitProcess.exec([ 'commit', '-m', 'Commit' ], repo.path)

      await GitProcess.exec([ 'branch', 'other-branch' ], repo.path)

      fs.writeFileSync(filePath, 'b1')
      await GitProcess.exec([ 'add', 'foo' ], repo.path)
      await GitProcess.exec([ 'commit', '-m', 'Commit' ], repo.path)

      await GitProcess.exec([ 'checkout', 'other-branch' ], repo.path)

      fs.writeFileSync(filePath, 'b2')
      await GitProcess.exec([ 'add', 'foo' ], repo.path)
      await GitProcess.exec([ 'commit', '-m', 'Commit' ], repo.path)

      await GitProcess.exec([ 'merge', 'master' ], repo.path)

      const isMerge = await mergeExists(repo)

      expect(isMerge).to.equal(true)
    })
  })
})
