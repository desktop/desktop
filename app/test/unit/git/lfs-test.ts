import { setupFixtureRepository } from '../../helpers/repositories'
import { Repository } from '../../../src/models/repository'
import { GitProcess } from 'dugite'
import { isUsingLFS, getLFSPaths } from '../../../src/lib/git/lfs'

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

  describe('getLFSPaths', () => {
    it('returns empty array for repository not using LFS', async () => {
      const path = await setupFixtureRepository('test-repo')
      const repository = new Repository(path, -1, null, false)

      const paths = await getLFSPaths(repository)
      expect(paths).toHaveLength(0)
    })

    it('returns all paths array for repository not using LFS', async () => {
      const path = await setupFixtureRepository('test-repo')
      const repository = new Repository(path, -1, null, false)

      await GitProcess.exec(['lfs', 'track', '*.psd'], repository.path)
      await GitProcess.exec(['lfs', 'track', '*.png'], repository.path)
      await GitProcess.exec(['lfs', 'track', 'app/*.iso'], repository.path)

      const paths = await getLFSPaths(repository)
      expect(paths).toHaveLength(3)

      expect(paths).toContain('*.psd')
      expect(paths).toContain('*.png')
      expect(paths).toContain('app/*.iso')
    })
  })
})
