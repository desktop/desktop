import { expect } from 'chai'
import { setupFixtureRepository } from '../../helpers/repositories'
import { Repository } from '../../../src/models/repository'
import { GitProcess } from 'dugite'
import { isUsingLFS } from '../../../src/lib/git/lfs'

describe('git-lfs', () => {
  describe('isUsingLFS', () => {
    it('returns false for repository not using LFS', async () => {
      const path = await setupFixtureRepository('test-repo')
      const repository = new Repository(path, -1, null, false)

      const usingLFS = await isUsingLFS(repository)
      expect(usingLFS).to.equal(false)
    })

    it('returns true if LFS is tracking a path', async () => {
      const path = await setupFixtureRepository('test-repo')
      const repository = new Repository(path, -1, null, false)

      await GitProcess.exec(['lfs', 'track', '*.psd'], repository.path)

      const usingLFS = await isUsingLFS(repository)
      expect(usingLFS).to.equal(true)
    })
  })
})
