import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as path from 'path'

import { Repository } from '../../../src/models/repository'
import { reset, resetPaths, GitResetMode } from '../../../src/lib/git/reset'
import { getStatusOrThrow } from '../../helpers/status'
import {
  PathspecMagicFileName,
  setupEmptyRepository,
  setupFixtureRepository,
  setupRepositoryWithPathspecMagicFile,
} from '../../helpers/repositories'
import { exec } from 'dugite'

import { readFile, unlink, writeFile } from 'fs/promises'

describe('git/reset', () => {
  describe('reset', () => {
    it('can hard reset a repository', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'test-repo')
      const repository = new Repository(testRepoPath, -1, null, false)

      const repoPath = repository.path
      const fileName = 'README.md'
      const filePath = path.join(repoPath, fileName)

      await writeFile(filePath, 'Hi world\n')

      await reset(repository, GitResetMode.Hard, 'HEAD')

      const status = await getStatusOrThrow(repository)
      assert.equal(status.workingDirectory.files.length, 0)
    })
  })

  describe('resetPaths', () => {
    it('unstages only the requested files with Windows-compatible names', async t => {
      const repository = await setupEmptyRepository(t)
      const selectedPaths = ['selected file.txt', '-selected.txt']
      const paths = [...selectedPaths, 'unrelated.txt']
      for (const filePath of paths) {
        await writeFile(path.join(repository.path, filePath), 'original\n')
      }
      for (const args of [
        ['add', '--all'],
        ['commit', '-m', 'Initial files'],
      ]) {
        const result = await exec(args, repository.path)
        assert.strictEqual(result.exitCode, 0, result.stderr)
      }
      for (const filePath of paths) {
        await writeFile(path.join(repository.path, filePath), 'modified\n')
      }
      const staged = await exec(['add', '--all'], repository.path)
      assert.strictEqual(staged.exitCode, 0, staged.stderr)

      await resetPaths(repository, GitResetMode.Mixed, 'HEAD', selectedPaths)

      const remaining = await exec(
        ['diff', '--cached', '--name-only', '-z'],
        repository.path
      )
      assert.strictEqual(remaining.exitCode, 0, remaining.stderr)
      assert.deepStrictEqual(remaining.stdout.split('\0').filter(Boolean), [
        'unrelated.txt',
      ])
      for (const filePath of paths) {
        const index = await exec(['show', `:${filePath}`], repository.path)
        assert.strictEqual(index.exitCode, 0, index.stderr)
        assert.strictEqual(
          index.stdout,
          selectedPaths.includes(filePath) ? 'original\n' : 'modified\n'
        )
        assert.strictEqual(
          await readFile(path.join(repository.path, filePath), 'utf8'),
          'modified\n'
        )
      }
    })

    it(
      'resets only the requested path when its name contains pathspec magic',
      { skip: process.platform === 'win32' },
      async t => {
        const repository = await setupRepositoryWithPathspecMagicFile(t)
        const specialFilePath = path.join(
          repository.path,
          PathspecMagicFileName
        )
        const unrelatedFilePath = path.join(repository.path, 'unrelated.txt')

        await writeFile(specialFilePath, 'modified special content\n')
        await writeFile(unrelatedFilePath, 'modified unrelated content\n')
        await exec(['add', '--all'], repository.path)

        await resetPaths(repository, GitResetMode.Mixed, 'HEAD', [
          PathspecMagicFileName,
        ])

        const stagedFiles = await exec(
          ['diff', '--cached', '--name-only', '-z'],
          repository.path
        )
        assert.deepEqual(stagedFiles.stdout.split('\0').filter(Boolean), [
          'unrelated.txt',
        ])
        assert.equal(
          await readFile(specialFilePath, 'utf8'),
          'modified special content\n'
        )
        assert.equal(
          await readFile(unrelatedFilePath, 'utf8'),
          'modified unrelated content\n'
        )
      }
    )

    it.skip('resets discarded staged file', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'test-repo')
      const repository = new Repository(testRepoPath, -1, null, false)

      const repoPath = repository.path
      const fileName = 'README.md'
      const filePath = path.join(repoPath, fileName)

      // modify the file
      await writeFile(filePath, 'Hi world\n')

      // stage the file, then delete it to mimic discarding
      exec(['add', fileName], repoPath)
      await unlink(filePath)

      await resetPaths(repository, GitResetMode.Mixed, 'HEAD', [filePath])

      // then checkout the version from the index to restore it
      await exec(['checkout-index', '-f', '-u', '-q', '--', fileName], repoPath)

      const status = await getStatusOrThrow(repository)
      assert.equal(status.workingDirectory.files.length, 0)
    })
  })
})
