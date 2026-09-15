import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as Path from 'path'
import { writeFile } from 'fs/promises'

import {
  setupFixtureRepository,
  setupEmptyRepository,
} from '../../helpers/repositories'
import { Repository } from '../../../src/models/repository'
import { exec } from 'dugite'
import {
  isUsingLFS,
  isTrackedByLFS,
  filesNotTrackedByLFS,
} from '../../../src/lib/git/lfs'

describe('git-lfs', () => {
  describe('isUsingLFS', () => {
    it('returns false for repository not using LFS', async t => {
      const path = await setupFixtureRepository(t, 'test-repo')
      const repository = new Repository(path, -1, null, false)

      const usingLFS = await isUsingLFS(repository)
      assert(!usingLFS)
    })

    it('returns true if LFS is tracking a path', async t => {
      const path = await setupFixtureRepository(t, 'test-repo')
      const repository = new Repository(path, -1, null, false)

      await exec(['lfs', 'track', '*.psd'], repository.path)

      const usingLFS = await isUsingLFS(repository)
      assert(usingLFS)
    })

    it('returns false if a non-LFS Git filter is configured', async t => {
      const repository = await setupEmptyRepository(t)
      const attributesPath = Path.join(
        repository.path,
        '.git',
        'info',
        'attributes'
      )

      await writeFile(attributesPath, '* filter=annex\n')

      const usingLFS = await isUsingLFS(repository)
      assert(!usingLFS)
    })

    it('returns true if LFS tracks a path alongside a non-LFS Git filter', async t => {
      const repository = await setupEmptyRepository(t)
      const attributesPath = Path.join(
        repository.path,
        '.git',
        'info',
        'attributes'
      )

      await writeFile(attributesPath, '* filter=annex\n')
      await exec(['lfs', 'track', '*.psd'], repository.path)

      const usingLFS = await isUsingLFS(repository)
      assert(usingLFS)
    })
  })

  describe('isTrackedByLFS', () => {
    it('returns false for repository not using LFS', async t => {
      const repository = await setupEmptyRepository(t)

      const file = 'README.md'
      const readme = Path.join(repository.path, file)
      await writeFile(readme, 'Hello world!')

      const found = await isTrackedByLFS(repository, file)
      assert(!found)
    })

    it('returns true after tracking file in Git LFS', async t => {
      const repository = await setupEmptyRepository(t)

      const file = 'README.md'
      const readme = Path.join(repository.path, file)
      await writeFile(readme, 'Hello world!')

      await exec(['lfs', 'track', '*.md'], repository.path)

      const found = await isTrackedByLFS(repository, file)
      assert(found)
    })

    it('returns true after tracking file with character issues in Git LFS', async t => {
      const repository = await setupEmptyRepository(t)

      const file =
        'Top Ten Worst Repositories to host on GitHub - Carlos Martín Nieto.md'
      const readme = Path.join(repository.path, file)
      await writeFile(readme, 'Hello world!')

      await exec(['lfs', 'track', '*.md'], repository.path)

      const found = await isTrackedByLFS(repository, file)
      assert(found)
    })
  })

  describe('filesNotTrackedByLFS', () => {
    it('returns files not listed in Git LFS', async t => {
      const repository = await setupEmptyRepository(t)
      await exec(['lfs', 'track', '*.md'], repository.path)

      const videoFile = 'some-video-file.mp4'

      const notFound = await filesNotTrackedByLFS(repository, [videoFile])

      assert.equal(notFound.length, 1)
      assert(notFound.includes(videoFile))
    })

    it('skips files that are tracked by Git LFS', async t => {
      const repository = await setupEmptyRepository(t)
      await exec(['lfs', 'track', '*.png'], repository.path)

      const photoFile = 'some-cool-photo.png'

      const notFound = await filesNotTrackedByLFS(repository, [photoFile])

      assert.equal(notFound.length, 0)
    })

    it('skips files in a subfolder that are tracked', async t => {
      const repository = await setupEmptyRepository(t)
      await exec(['lfs', 'track', '*.png'], repository.path)

      const photoFileInDirectory = 'app/src/some-cool-photo.png'
      const notFound = await filesNotTrackedByLFS(repository, [
        photoFileInDirectory,
      ])

      assert.equal(notFound.length, 0)
    })

    it('skips files in a subfolder where the rule only covers the subdirectory', async t => {
      const repository = await setupEmptyRepository(t)
      await exec(['lfs', 'track', 'app/src/*.png'], repository.path)

      const photoFileInDirectory = 'app/src/some-cool-photo.png'
      const notFound = await filesNotTrackedByLFS(repository, [
        photoFileInDirectory,
      ])

      assert.equal(notFound.length, 0)
    })
  })
})
