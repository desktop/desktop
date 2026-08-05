import { describe, it } from 'node:test'
import assert from 'node:assert'
import { GitError } from 'dugite'
import {
  git,
  parseConfigLockFilePathFromError,
  IGitResult,
} from '../../../src/lib/git'
import { setupFixtureRepository } from '../../helpers/repositories'
import { join, resolve } from 'path'
import { cp } from 'fs/promises'

describe('git/core', () => {
  describe('error handling', () => {
    it('does not throw for errors that were expected', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'test-repo')

      const args = ['rev-list', '--left-right', '--count', 'some-ref', '--']
      const result = await git(args, testRepoPath, 'test', {
        expectedErrors: new Set([GitError.BadRevision]),
      })
      assert.equal(result.gitError, GitError.BadRevision)
    })

    it('throws for errors that were not expected', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'test-repo')

      const args = ['rev-list', '--left-right', '--count', 'some-ref', '--']
      await assert.rejects(
        git(args, testRepoPath, 'test', {
          expectedErrors: new Set([GitError.SSHKeyAuditUnverified]),
        })
      )
    })
  })

  describe('exit code handling', () => {
    it('does not throw for exit codes that were expected', async t => {
      const repoPath = await setupFixtureRepository(t, 'test-repo')
      const args = ['rev-list', '--left-right', '--count', 'some-ref', '--']
      const result = await git(args, repoPath, 'test', {
        successExitCodes: new Set([128]),
      })
      assert.equal(result.exitCode, 128)
    })

    it('throws for exit codes that were not expected', async t => {
      const repoPath = await setupFixtureRepository(t, 'test-repo')
      const args = ['rev-list', '--left-right', '--count', 'some-ref', '--']
      await assert.rejects(
        git(args, repoPath, 'test', { successExitCodes: new Set([2]) })
      )
    })
  })

  describe('config lock file error handling', () => {
    it('can parse lock file path from stderr', async t => {
      const repoPath = await setupFixtureRepository(t, 'test-repo')

      const configFilePath = join(repoPath, '.git', 'config')
      const configLockFilePath = `${configFilePath}.lock`

      await cp(configFilePath, configLockFilePath)

      const args = ['config', '--local', 'user.name', 'niik']
      const result = await git(args, repoPath, 'test', {
        expectedErrors: new Set([GitError.ConfigLockFileAlreadyExists]),
      })

      assert.equal(result.exitCode, 255)
      assert.equal(result.gitError, GitError.ConfigLockFileAlreadyExists)
      const parsedPath = parseConfigLockFilePathFromError(result)
      assert(parsedPath !== null)
      const absolutePath = resolve(result.path, parsedPath)
      assert.equal(absolutePath, configLockFilePath)
    })

    it('normalizes paths', () => {
      function createGitResult(stderr: string): IGitResult {
        return {
          exitCode: 255,
          gitError: GitError.ConfigLockFileAlreadyExists,
          path: __WIN32__ ? 'c:\\' : '/',
          gitErrorDescription: null,
          stderr,
          stdout: '',
        }
      }

      if (__WIN32__) {
        assert.equal(
          parseConfigLockFilePathFromError(
            createGitResult(
              'error: could not lock config file C:/Users/markus/.gitconfig: File exists'
            )
          ),
          'C:\\Users\\markus\\.gitconfig.lock'
        )

        assert.equal(
          parseConfigLockFilePathFromError(
            createGitResult(
              'error: could not lock config file C:\\Users\\markus\\.gitconfig: File exists'
            )
          ),
          'C:\\Users\\markus\\.gitconfig.lock'
        )
      } else {
        assert.equal(
          parseConfigLockFilePathFromError(
            createGitResult(
              'error: could not lock config file /Users/markus/.gitconfig: File exists'
            )
          ),
          '/Users/markus/.gitconfig.lock'
        )
      }
    })
  })
})
