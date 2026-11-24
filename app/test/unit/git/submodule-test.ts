import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as path from 'path'
import { readFile, writeFile } from 'fs/promises'
import { exec } from 'dugite'

import { Repository } from '../../../src/models/repository'
import {
  listSubmodules,
  resetSubmodulePaths,
} from '../../../src/lib/git/submodule'
import { checkoutBranch, getBranches } from '../../../src/lib/git'
import {
  setupEmptyRepository,
  setupFixtureRepository,
} from '../../helpers/repositories'

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
    for (const selectedPath of [':(glob)*-module', '*-module']) {
      it(
        `discards only the literal submodule ${selectedPath}`,
        { skip: process.platform === 'win32' },
        async t => {
          const source = await setupEmptyRepository(t)
          const repository = await setupEmptyRepository(t)
          await writeFile(path.join(source.path, 'example.txt'), 'original\n')
          for (const args of [
            ['add', '--', 'example.txt'],
            ['commit', '-m', 'Initial content'],
          ]) {
            const result = await exec(args, source.path)
            assert.strictEqual(result.exitCode, 0, result.stderr)
          }
          for (const modulePath of ['selected-module', 'unintended-module']) {
            const result = await exec(
              [
                '-c',
                'protocol.file.allow=always',
                'submodule',
                'add',
                '--',
                source.path,
                modulePath,
              ],
              repository.path
            )
            assert.strictEqual(result.exitCode, 0, result.stderr)
          }
          for (const args of [
            [
              '--literal-pathspecs',
              'mv',
              '--',
              'selected-module',
              selectedPath,
            ],
            ['add', '--', '.gitmodules'],
            ['commit', '-m', 'Add submodules'],
          ]) {
            const result = await exec(args, repository.path)
            assert.strictEqual(result.exitCode, 0, result.stderr)
          }
          const selectedFile = path.join(
            repository.path,
            selectedPath,
            'example.txt'
          )
          const unrelatedFile = path.join(
            repository.path,
            'unintended-module',
            'example.txt'
          )
          await writeFile(selectedFile, 'selected edit\n')
          await writeFile(unrelatedFile, 'unrelated edit\n')

          await resetSubmodulePaths(repository, [selectedPath])

          assert.strictEqual(await readFile(selectedFile, 'utf8'), 'original\n')
          assert.strictEqual(
            await readFile(unrelatedFile, 'utf8'),
            'unrelated edit\n'
          )
        }
      )
    }

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
