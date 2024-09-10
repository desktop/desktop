import * as path from 'path'
import { readFile, writeFile } from 'fs-extra'

import { Repository } from '../../../src/models/repository'
import {
  listSubmodules,
  resetSubmodulePaths,
} from '../../../src/lib/git/submodule'
import { checkoutBranch, getBranches } from '../../../src/lib/git'
import { setupFixtureRepository } from '../../helpers/repositories'

describe('git/submodule', () => {
  describe('listSubmodules', () => {
    it('returns the submodule entry', async () => {
      const testRepoPath = await setupFixtureRepository('submodule-basic-setup')
      const repository = new Repository(testRepoPath, -1, null, false)
      const result = await listSubmodules(repository)
      expect(result).toHaveLength(1)
      expect(result[0].sha).toBe('c59617b65080863c4ca72c1f191fa1b423b92223')
      expect(result[0].path).toBe('foo/submodule')
      expect(result[0].describe).toBe('first-tag~2')
    })

    it('returns the expected tag', async () => {
      const testRepoPath = await setupFixtureRepository('submodule-basic-setup')
      const repository = new Repository(testRepoPath, -1, null, false)

      const submodulePath = path.join(testRepoPath, 'foo', 'submodule')
      const submoduleRepository = new Repository(submodulePath, -1, null, false)

      const branches = await getBranches(
        submoduleRepository,
        'refs/remotes/origin/feature-branch'
      )

      if (branches.length === 0) {
        throw new Error(`Could not find branch: feature-branch`)
      }

      await checkoutBranch(submoduleRepository, branches[0], null)

      const result = await listSubmodules(repository)
      expect(result).toHaveLength(1)
      expect(result[0].sha).toBe('14425bb2a4ee361af7f789a81b971f8466ae521d')
      expect(result[0].path).toBe('foo/submodule')
      expect(result[0].describe).toBe('heads/feature-branch')
    })
  })

  describe('resetSubmodulePaths', () => {
    it('update submodule to original commit', async () => {
      const testRepoPath = await setupFixtureRepository('submodule-basic-setup')
      const repository = new Repository(testRepoPath, -1, null, false)

      const submodulePath = path.join(testRepoPath, 'foo', 'submodule')
      const submoduleRepository = new Repository(submodulePath, -1, null, false)

      const branches = await getBranches(
        submoduleRepository,
        'refs/remotes/origin/feature-branch'
      )

      if (branches.length === 0) {
        throw new Error(`Could not find branch: feature-branch`)
      }

      await checkoutBranch(submoduleRepository, branches[0], null)

      let result = await listSubmodules(repository)
      expect(result[0].describe).toBe('heads/feature-branch')

      await resetSubmodulePaths(repository, ['foo/submodule'])

      result = await listSubmodules(repository)
      expect(result[0].describe).toBe('first-tag~2')
    })

    it('eliminate submodule dirty state', async () => {
      const testRepoPath = await setupFixtureRepository('submodule-basic-setup')
      const repository = new Repository(testRepoPath, -1, null, false)

      const submodulePath = path.join(testRepoPath, 'foo', 'submodule')

      const filePath = path.join(submodulePath, 'README.md')
      await writeFile(filePath, 'changed', { encoding: 'utf8' })

      await resetSubmodulePaths(repository, ['foo/submodule'])

      const result = await readFile(filePath, { encoding: 'utf8' })
      expect(result).toBe('# submodule-test-case')
    })
  })
})
