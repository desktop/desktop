import * as Path from 'path'
import { writeFile } from 'fs-extra'

import {
  setupFixtureRepository,
  setupEmptyRepository,
} from '../../helpers/repositories'
import { Repository } from '../../../src/models/repository'
import { GitProcess } from 'dugite'
import { isUsingLFS, isTrackedByLFS } from '../../../src/lib/git/lfs'

describe('git-lfs', () => {
  describe('isUsingLFS', () => {
    it('returns false for repository not using LFS', async () => {
      const path = await setupFixtureRepository('test-repo')
      const repository = new Repository(path, -1, null, false)

      const usingLFS = await isUsingLFS(repository)
      expect(usingLFS).toBe(false)
    })

    it('returns true if LFS is tracking a path', async () => {
      const path = await setupFixtureRepository('test-repo')
      const repository = new Repository(path, -1, null, false)

      await GitProcess.exec(['lfs', 'track', '*.psd'], repository.path)

      const usingLFS = await isUsingLFS(repository)
      expect(usingLFS).toBe(true)
    })
  })

  describe('isTrackedByLFS', () => {
    it('returns false for repository not using LFS', async () => {
      const repository = await setupEmptyRepository()

      const file = 'README.md'
      const readme = Path.join(repository.path, file)
      await writeFile(readme, 'Hello world!')

      const found = await isTrackedByLFS(repository, file)
      expect(found).toBe(false)
    })

    it('returns true after tracking file in Git LFS', async () => {
      const repository = await setupEmptyRepository()

      const file = 'README.md'
      const readme = Path.join(repository.path, file)
      await writeFile(readme, 'Hello world!')

      await GitProcess.exec(['lfs', 'track', '*.md'], repository.path)

      const found = await isTrackedByLFS(repository, file)
      expect(found).toBe(true)
    })
  })
})
