import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as path from 'path'
import { mkdir, realpath, writeFile } from 'fs/promises'

import { Repository } from '../../../src/models/repository'
import { getRepositoryType } from '../../../src/lib/git/rev-parse'
import { git } from '../../../src/lib/git/core'
import {
  setupFixtureRepository,
  setupEmptyRepository,
} from '../../helpers/repositories'
import { exec } from 'dugite'
import { createTempDirectory } from '../../helpers/temp'

describe('git/rev-parse', () => {
  describe('getRepositoryType', () => {
    it('should return an absolute path when run inside a working directory', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'test-repo')
      const repository = new Repository(testRepoPath, -1, null, false)

      const result = await getRepositoryType(repository.path)
      assert.equal(result.kind, 'regular')
      assert(result.kind === 'regular')
      assert.equal(result.topLevelWorkingDirectory, repository.path)
      assert.equal(
        await realpath(result.gitDir),
        await realpath(path.join(repository.path, '.git'))
      )

      const subdirPath = path.join(repository.path, 'subdir')
      await mkdir(subdirPath)

      const subdirResult = await getRepositoryType(subdirPath)
      assert.equal(subdirResult.kind, 'regular')
      assert(subdirResult.kind === 'regular')
      assert.equal(subdirResult.topLevelWorkingDirectory, repository.path)
      assert.equal(
        await realpath(subdirResult.gitDir),
        await realpath(path.join(repository.path, '.git'))
      )
    })

    it('should return missing when not run inside a working directory', async t => {
      const result = await getRepositoryType(await createTempDirectory(t))
      assert.deepEqual(result, { kind: 'missing' })
    })

    it('should return correct path for submodules', async t => {
      const fixturePath = await createTempDirectory(t)

      const firstRepoPath = path.join(fixturePath, 'repo1')
      const secondRepoPath = path.join(fixturePath, 'repo2')

      await git(['init', 'repo1'], fixturePath, '')

      await git(['init', 'repo2'], fixturePath, '')

      await git(
        ['commit', '--allow-empty', '-m', 'Initial commit'],
        secondRepoPath,
        ''
      )

      await git(
        [
          // Git 2.38 (backported into 2.35.5) changed the default here to 'user'
          ...['-c', 'protocol.file.allow=always'],
          ...['submodule', 'add', '../repo2'],
        ],
        firstRepoPath,
        ''
      )

      const firstResult = await getRepositoryType(firstRepoPath)
      assert.equal(firstResult.kind, 'regular')
      assert(firstResult.kind === 'regular')
      assert.equal(firstResult.topLevelWorkingDirectory, firstRepoPath)
      assert.equal(
        await realpath(firstResult.gitDir),
        await realpath(path.join(firstRepoPath, '.git'))
      )

      const subModulePath = path.join(firstRepoPath, 'repo2')
      const subResult = await getRepositoryType(subModulePath)
      assert.equal(subResult.kind, 'regular')
      assert(subResult.kind === 'regular')
      assert.equal(subResult.topLevelWorkingDirectory, subModulePath)
      assert.equal(
        await realpath(subResult.gitDir),
        await realpath(path.join(firstRepoPath, '.git', 'modules', 'repo2'))
      )
    })

    it('returns regular for default initialized repository', async t => {
      const repository = await setupEmptyRepository(t)
      const result = await getRepositoryType(repository.path)
      assert.equal(result.kind, 'regular')
      assert(result.kind === 'regular')
      assert.equal(result.topLevelWorkingDirectory, repository.path)
      assert.equal(
        await realpath(result.gitDir),
        await realpath(path.join(repository.path, '.git'))
      )
    })

    it('returns bare for initialized bare repository', async t => {
      const path = await createTempDirectory(t)
      await exec(['init', '--bare'], path)
      assert.deepEqual(await getRepositoryType(path), {
        kind: 'bare',
      })
    })

    it('returns missing for empty directory', async t => {
      const p = await createTempDirectory(t)
      assert.deepEqual(await getRepositoryType(p), {
        kind: 'missing',
      })
    })

    it('returns missing for missing directory', async t => {
      const rootPath = await createTempDirectory(t)
      const missingPath = path.join(rootPath, 'missing-folder')

      assert.deepEqual(await getRepositoryType(missingPath), {
        kind: 'missing',
      })
    })

    it('returns unsafe for unsafe repository', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'test-repo')
      const repository = new Repository(testRepoPath, -1, null, false)

      const previousHomeValue = process.env['HOME']

      // Creating a stub global config so we can unset safe.directory config
      // which will supersede any system config that might set * to ignore
      // warnings about a different owner
      //
      // This is because safe.directory setting is ignored if found in local
      // config, environment variables or command line arguments.
      const testHomeDirectory = await createTempDirectory(t)
      const gitConfigPath = path.join(testHomeDirectory, '.gitconfig')
      await writeFile(
        gitConfigPath,
        `[safe]
directory=`
      )

      process.env['HOME'] = testHomeDirectory
      process.env['GIT_TEST_ASSUME_DIFFERENT_OWNER'] = '1'

      assert((await getRepositoryType(repository.path)).kind === 'unsafe')

      process.env['GIT_TEST_ASSUME_DIFFERENT_OWNER'] = undefined
      process.env['HOME'] = previousHomeValue
    })
  })
})
