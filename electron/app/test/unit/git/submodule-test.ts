import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as path from 'path'
import { readFile, writeFile } from 'fs/promises'

import { Repository } from '../../../src/models/repository'
import {
  listSubmodules,
  resetSubmodulePaths,
} from '../../../src/lib/git/submodule'
import { checkoutBranch, getBranches } from '../../../src/lib/git'
import { setupFixtureRepository } from '../../helpers/repositories'

describe('git/submodule', () => {
  describe('listSubmodules', () => {
    it('returns the submodule entry', async t => {
      const testRepoPath = await setupFixtureRepository(
        t,
        'submodule-basic-setup'
      )
      const repository = new Repository(testRepoPath, -1, null, false)
      const result = await listSubmodules(repository)
      assert.equal(result.length, 1)
      assert.equal(result[0].sha, 'c59617b65080863c4ca72c1f191fa1b423b92223')
      assert.equal(result[0].path, 'foo/submodule')
      assert.equal(result[0].describe, 'first-tag~2')
    })

    it('returns the expected tag', async t => {
      const testRepoPath = await setupFixtureRepository(
        t,
        'submodule-basic-setup'
      )
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
      assert.equal(result.length, 1)
      assert.equal(result[0].sha, '14425bb2a4ee361af7f789a81b971f8466ae521d')
      assert.equal(result[0].path, 'foo/submodule')
      assert.equal(result[0].describe, 'heads/feature-branch')
    })
  })

  describe('resetSubmodulePaths', () => {
    it('update submodule to original commit', async t => {
      const testRepoPath = await setupFixtureRepository(
        t,
        'submodule-basic-setup'
      )
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
      assert.equal(result[0].describe, 'heads/feature-branch')

      await resetSubmodulePaths(repository, ['foo/submodule'])

      result = await listSubmodules(repository)
      assert.equal(result[0].describe, 'first-tag~2')
    })

    it('eliminate submodule dirty state', async t => {
      const testRepoPath = await setupFixtureRepository(
        t,
        'submodule-basic-setup'
      )
      const repository = new Repository(testRepoPath, -1, null, false)

      const submodulePath = path.join(testRepoPath, 'foo', 'submodule')

      const filePath = path.join(submodulePath, 'README.md')
      await writeFile(filePath, 'changed', { encoding: 'utf8' })

      await resetSubmodulePaths(repository, ['foo/submodule'])

      const result = await readFile(filePath, { encoding: 'utf8' })
      assert.equal(result, '# submodule-test-case')
    })
  })
})
