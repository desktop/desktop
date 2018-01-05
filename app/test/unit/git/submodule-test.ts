import { expect } from 'chai'
import * as path from 'path'

import { Repository } from '../../../src/models/repository'
import { listSubmodules } from '../../../src/lib/git/submodule'
import { checkoutBranch } from '../../../src/lib/git/checkout'
import { setupFixtureRepository } from '../../helpers/repositories'

describe('git/submodule', () => {
  describe('listSubmodules', () => {
    it('returns the submodule entry', async () => {
      const testRepoPath = setupFixtureRepository('submodule-basic-setup')
      const repository = new Repository(testRepoPath, -1, null, false)
      const result = await listSubmodules(repository)
      expect(result.length).to.equal(1)
      expect(result[0].sha).to.equal('c59617b65080863c4ca72c1f191fa1b423b92223')
      expect(result[0].path).to.equal('foo/submodule')
      expect(result[0].nearestTag).to.equal('first-tag~2')
    })

    it('returns the expected tag', async () => {
      const testRepoPath = setupFixtureRepository('submodule-basic-setup')
      const repository = new Repository(testRepoPath, -1, null, false)

      const submodulePath = path.join(testRepoPath, 'foo', 'submodule')
      const submoduleRepository = new Repository(submodulePath, -1, null, false)

      await checkoutBranch(submoduleRepository, null, 'feature-branch')

      const result = await listSubmodules(repository)
      expect(result.length).to.equal(1)
      expect(result[0].sha).to.equal('14425bb2a4ee361af7f789a81b971f8466ae521d')
      expect(result[0].path).to.equal('foo/submodule')
      expect(result[0].nearestTag).to.equal('heads/feature-branch')
    })
  })
})
