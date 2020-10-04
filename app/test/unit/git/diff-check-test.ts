import { Repository } from '../../../src/models/repository'
import {
  setupConflictedRepo,
  setupConflictedRepoWithMultipleFiles,
  setupEmptyRepository,
} from '../../helpers/repositories'

import { getFilesWithConflictMarkers } from '../../../src/lib/git/diff-check'

describe('getFilesWithConflictMarkers', () => {
  let repository: Repository

  describe('with one conflicted file', () => {
    beforeEach(async () => {
      repository = await setupConflictedRepo()
    })

    it('finds one conflicted file', async () => {
      expect(await getFilesWithConflictMarkers(repository.path)).toEqual(
        new Map([['foo', 3]])
      )
    })
  })

  describe('with one conflicted file', () => {
    beforeEach(async () => {
      repository = await setupConflictedRepoWithMultipleFiles()
    })
    it('finds multiple conflicted files', async () => {
      expect(await getFilesWithConflictMarkers(repository.path)).toEqual(
        new Map([
          ['baz', 3],
          ['cat', 3],
          ['foo', 3],
        ])
      )
    })
  })

  describe('with no conflicted files', () => {
    beforeEach(async () => {
      repository = await setupEmptyRepository()
    })

    it('finds one conflicted file', async () => {
      expect(await getFilesWithConflictMarkers(repository.path)).toEqual(
        new Map()
      )
    })
  })
})
