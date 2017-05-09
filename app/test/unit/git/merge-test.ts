/* tslint:disable:no-sync-functions */

import * as path from 'path'
import { expect } from 'chai'

import {
  mergeExists,
  getStatus,
  createCommit,
  getCommit,
} from '../../../src/lib/git'

import { setupEmptyRepository } from '../../fixture-helper'
import { GitProcess } from 'dugite'

import * as fs from 'fs-extra'

async function createConflictedRepo() {
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

  return repo
}

describe('git/merge', () => {
  describe('mergeExists', () => {
    it('detects a merge conflict', async () => {
      const repo = await createConflictedRepo()

      const isMerge = await mergeExists(repo)

      expect(isMerge).to.equal(true)
    })

    it('committing as part of a merge will strip comments', async () => {
      const repo = await createConflictedRepo()

      const status = await getStatus(repo)
      const files = status.workingDirectory.files
      expect(files.length).to.equal(1)

      const message = `Special commit

# this is a comment`

      await createCommit(repo, message, files)

      const commit = await getCommit(repo, 'HEAD')
      expect(commit).to.not.be.null
      expect(commit!.summary).to.equal('Special commit')
      expect(commit!.body.length).to.equal(0)
    })
  })
})
