import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as path from 'path'
import { cp, mkdir, realpath, symlink } from 'fs/promises'

import { Repository } from '../../../src/models/repository'
import { getRepositoryType } from '../../../src/lib/git/rev-parse'
import { git } from '../../../src/lib/git/core'
import {
  setupFixtureRepository,
  setupEmptyRepository,
} from '../../helpers/repositories'
import { exec } from 'dugite'
import { createTempDirectory } from '../../helpers/temp'
import { setupOwnershipCheck } from '../../helpers/ownership-check'
import { addSafeDirectory } from '../../../src/lib/git/config'

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
      await setupOwnershipCheck(t)
      const canonicalPath = await realpath(testRepoPath)

      assert.deepEqual(await getRepositoryType(testRepoPath), {
        kind: 'unsafe',
        path: __WIN32__ ? canonicalPath.replaceAll('\\', '/') : canonicalPath,
      })
    })

    const traceVariables = [
      'GIT_TRACE',
      'GIT_TRACE2',
      'GIT_TRACE2_EVENT',
      'GIT_TRACE2_PERF',
    ]
    for (const traceVariable of [undefined, ...traceVariables]) {
      for (const multiline of __WIN32__ ? [false] : [false, true]) {
        it(`keeps the exact directory with ${
          traceVariable ?? 'no tracing'
        } and ${
          multiline ? 'diagnostic-like' : 'ordinary'
        } directory names`, async t => {
          const repository = await setupEmptyRepository(t)
          const unrelated = await setupEmptyRepository(t)
          const parent = await realpath(await createTempDirectory(t))
          const name = multiline
            ? `repository'\nfatal: detected dubious ownership in repository at '${parent}'\nfatal: detected dubious ownership in repository at '/*'\nend`
            : "repository's directory [1]"
          const repositoryPath = path.join(parent, name)
          await cp(repository.path, repositoryPath, { recursive: true })
          const nested = path.join(repositoryPath, 'nested')
          await mkdir(nested)
          await setupOwnershipCheck(t)

          for (const variable of traceVariables) {
            const previous = process.env[variable]
            t.after(() => {
              if (previous === undefined) {
                delete process.env[variable]
              } else {
                process.env[variable] = previous
              }
            })
            process.env[variable] = variable === traceVariable ? '1' : '0'
          }

          const canonicalPath = await realpath(repositoryPath)
          const expectedPath = __WIN32__
            ? canonicalPath.replaceAll('\\', '/')
            : canonicalPath
          for (const directory of [repositoryPath, nested]) {
            assert.deepEqual(await getRepositoryType(directory), {
              kind: 'unsafe',
              path: expectedPath,
            })
          }

          await addSafeDirectory(expectedPath)
          assert.strictEqual((await getRepositoryType(nested)).kind, 'regular')
          assert.strictEqual(
            (await getRepositoryType(unrelated.path)).kind,
            'unsafe'
          )
          assert.deepEqual(
            await getRepositoryType(await createTempDirectory(t)),
            { kind: 'missing' }
          )
        })
      }
    }

    for (const name of [
      'repository with spaces',
      "repository's directory",
      'repository [1]',
      ...(__WIN32__ ? [] : ['repository\nwith newlines']),
    ]) {
      it(`keeps the exact directory for ${JSON.stringify(name)}`, async t => {
        const repository = await setupEmptyRepository(t)
        const unrelated = await setupEmptyRepository(t)
        const parent = await createTempDirectory(t)
        const repositoryPath = path.join(parent, name)
        await cp(repository.path, repositoryPath, { recursive: true })
        await setupOwnershipCheck(t)

        const result = await getRepositoryType(repositoryPath)
        assert(result.kind === 'unsafe')
        const canonicalPath = await realpath(repositoryPath)
        assert.strictEqual(
          result.path,
          __WIN32__ ? canonicalPath.replaceAll('\\', '/') : canonicalPath
        )

        await addSafeDirectory(result.path)
        await addSafeDirectory(result.path)
        const config = await git(
          ['config', '--global', '-z', '--get-all', 'safe.directory'],
          parent,
          ''
        )
        assert.deepEqual(config.stdout.split('\0'), ['', result.path, ''])
        assert.strictEqual(
          (await getRepositoryType(repositoryPath)).kind,
          'regular'
        )
        assert.strictEqual(
          (await getRepositoryType(unrelated.path)).kind,
          'unsafe'
        )
      })
    }

    it('finds the repository from a nested directory through a symlink', async t => {
      const repository = await setupEmptyRepository(t)
      const nested = path.join(repository.path, 'one', 'two')
      await mkdir(nested, { recursive: true })
      const parent = await createTempDirectory(t)
      const link = path.join(parent, 'link')
      await symlink(repository.path, link, 'junction')
      await setupOwnershipCheck(t)

      const result = await getRepositoryType(path.join(link, 'one', 'two'))
      assert(result.kind === 'unsafe')
      const canonicalPath = await realpath(repository.path)
      assert.strictEqual(
        result.path,
        __WIN32__ ? canonicalPath.replaceAll('\\', '/') : canonicalPath
      )
      await addSafeDirectory(result.path)
      assert.strictEqual((await getRepositoryType(nested)).kind, 'regular')
    })

    it('uses the working directory for a linked worktree', async t => {
      const repositoryPath = await setupFixtureRepository(t, 'test-repo')
      const parent = await createTempDirectory(t)
      const worktree = path.join(parent, 'worktree')
      await git(['worktree', 'add', '--detach', worktree], repositoryPath, '')
      const nested = path.join(worktree, 'nested')
      await mkdir(nested)
      await setupOwnershipCheck(t)

      const result = await getRepositoryType(nested)
      assert(result.kind === 'unsafe')
      const canonicalPath = await realpath(worktree)
      assert.strictEqual(
        result.path,
        __WIN32__ ? canonicalPath.replaceAll('\\', '/') : canonicalPath
      )
      await addSafeDirectory(result.path)
      assert.strictEqual((await getRepositoryType(nested)).kind, 'regular')
      assert.strictEqual(
        (await getRepositoryType(repositoryPath)).kind,
        'unsafe'
      )
    })
  })
})
