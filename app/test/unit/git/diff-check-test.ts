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
        new Set<string>(['foo'])
      )
    })
  })

  describe('with one conflicted file', () => {
    beforeEach(async () => {
      repository = await setupConflictedRepoWithMultipleFiles()
    })
    it('finds multiple conflicted files', async () => {
      expect(await getFilesWithConflictMarkers(repository.path)).toEqual(
        new Set<string>(['foo', 'bar', 'baz'])
      )
    })
  })

  describe('with no conflicted files', () => {
    beforeEach(async () => {
      repository = await setupEmptyRepository()
    })

    it('finds one conflicted file', async () => {
      expect(await getFilesWithConflictMarkers(repository.path)).toEqual(
        new Set<string>([])
      )
    })
  })
})
