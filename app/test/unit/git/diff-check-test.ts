import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  setupConflictedRepo,
  setupConflictedRepoWithMultipleFiles,
  setupEmptyRepository,
} from '../../helpers/repositories'

import { getFilesWithConflictMarkers } from '../../../src/lib/git/diff-check'

describe('getFilesWithConflictMarkers', () => {
  describe('with one conflicted file', () => {
    it('finds one conflicted file', async t => {
      const repository = await setupConflictedRepo(t)

      assert.deepStrictEqual(
        await getFilesWithConflictMarkers(repository.path),
        new Map([['foo', 3]])
      )
    })
  })

  describe('with one conflicted file', () => {
    it('finds multiple conflicted files', async t => {
      const repository = await setupConflictedRepoWithMultipleFiles(t)
      assert.deepStrictEqual(
        await getFilesWithConflictMarkers(repository.path),
        new Map([
          ['baz', 3],
          ['cat', 3],
          ['foo', 3],
        ])
      )
    })
  })

  describe('with no conflicted files', () => {
    it('finds no conflicted files', async t => {
      const repository = await setupEmptyRepository(t)
      assert((await getFilesWithConflictMarkers(repository.path)).size === 0)
    })
  })
})
