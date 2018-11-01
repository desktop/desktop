import * as Path from 'path'
import { writeFile } from 'fs-extra'

import {
  setupFixtureRepository,
  setupEmptyRepository,
} from '../../helpers/repositories'
import { Repository } from '../../../src/models/repository'
import { GitProcess } from 'dugite'
import {
  isUsingLFS,
  isTrackedByLFS,
  filesNotTrackedByLFS,
} from '../../../src/lib/git/lfs'

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

  describe('filesNotTrackedByLFS', () => {
    it('returns files not listed in Git LFS', async () => {
      const repository = await setupEmptyRepository()
      await GitProcess.exec(['lfs', 'track', '*.md'], repository.path)

      const videoFile = 'some-video-file.mp4'

      const notFound = await filesNotTrackedByLFS(repository, [videoFile])

      expect(notFound).toHaveLength(1)
      expect(notFound).toContain(videoFile)
    })

    it('skips files that are tracked by Git LFS', async () => {
      const repository = await setupEmptyRepository()
      await GitProcess.exec(['lfs', 'track', '*.png'], repository.path)

      const photoFile = 'some-cool-photo.png'

      const notFound = await filesNotTrackedByLFS(repository, [photoFile])

      expect(notFound).toHaveLength(0)
    })

    it('skips files in a subfolder that are tracked', async () => {
      const repository = await setupEmptyRepository()
      await GitProcess.exec(['lfs', 'track', '*.png'], repository.path)

      const photoFileInDirectory = 'app/src/some-cool-photo.png'
      const notFound = await filesNotTrackedByLFS(repository, [
        photoFileInDirectory,
      ])

      expect(notFound).toHaveLength(0)
    })

    it('skips files in a subfolder where the rule only covers the subdirectory', async () => {
      const repository = await setupEmptyRepository()
      await GitProcess.exec(['lfs', 'track', 'app/src/*.png'], repository.path)

      const photoFileInDirectory = 'app/src/some-cool-photo.png'
      const notFound = await filesNotTrackedByLFS(repository, [
        photoFileInDirectory,
      ])

      expect(notFound).toHaveLength(0)
    })
  })
})
