import { GitError } from 'dugite'
import { Repository } from '../../../src/models/repository'
import {
  git,
  parseConfigLockFilePathFromError,
  IGitResult,
} from '../../../src/lib/git'
import { setupFixtureRepository } from '../../helpers/repositories'
import { join, resolve } from 'path'
import { copy } from 'fs-extra'

describe('git/core', () => {
  let repository: Repository

  beforeEach(async () => {
    const testRepoPath = await setupFixtureRepository('test-repo')
    repository = new Repository(testRepoPath, -1, null, false)
  })

  describe('error handling', () => {
    it('does not throw for errors that were expected', async () => {
      const args = ['rev-list', '--left-right', '--count', 'some-ref', '--']

      let threw = false
      try {
        const result = await git(args, repository.path, 'test', {
          expectedErrors: new Set([GitError.BadRevision]),
        })
        expect(result.gitError).toBe(GitError.BadRevision)
      } catch (e) {
        threw = true
      }

      expect(threw).toBe(false)
    })

    it('throws for errors that were not expected', async () => {
      const args = ['rev-list', '--left-right', '--count', 'some-ref', '--']

      let threw = false
      try {
        await git(args, repository.path, 'test', {
          expectedErrors: new Set([GitError.SSHKeyAuditUnverified]),
        })
      } catch (e) {
        threw = true
      }

      expect(threw).toBe(true)
    })
  })

  describe('exit code handling', () => {
    it('does not throw for exit codes that were expected', async () => {
      const args = ['rev-list', '--left-right', '--count', 'some-ref', '--']

      let threw = false
      try {
        const result = await git(args, repository.path, 'test', {
          successExitCodes: new Set([128]),
        })
        expect(result.exitCode).toBe(128)
      } catch (e) {
        threw = true
      }

      expect(threw).toBe(false)
    })

    it('throws for exit codes that were not expected', async () => {
      const args = ['rev-list', '--left-right', '--count', 'some-ref', '--']

      let threw = false
      try {
        await git(args, repository.path, 'test', {
          successExitCodes: new Set([2]),
        })
      } catch (e) {
        threw = true
      }

      expect(threw).toBe(true)
    })
  })

  describe('config lock file error handling', () => {
    it('can parse lock file path from stderr', async () => {
      const configFilePath = join(repository.path, '.git', 'config')
      const configLockFilePath = `${configFilePath}.lock`

      await copy(configFilePath, configLockFilePath)

      const args = ['config', '--local', 'user.name', 'niik']
      const result = await git(args, repository.path, 'test', {
        expectedErrors: new Set([GitError.ConfigLockFileAlreadyExists]),
      })

      expect(result.exitCode).toBe(255)
      expect(result.gitError).toBe(GitError.ConfigLockFileAlreadyExists)
      const parsedPath = parseConfigLockFilePathFromError(result)
      expect(parsedPath).not.toBeNull()
      const absolutePath = resolve(result.path, parsedPath!)
      expect(absolutePath).toBe(configLockFilePath)
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
        expect(
          parseConfigLockFilePathFromError(
            createGitResult(
              'error: could not lock config file C:/Users/markus/.gitconfig: File exists'
            )
          )
        ).toBe('C:\\Users\\markus\\.gitconfig.lock')

        expect(
          parseConfigLockFilePathFromError(
            createGitResult(
              'error: could not lock config file C:\\Users\\markus\\.gitconfig: File exists'
            )
          )
        ).toBe('C:\\Users\\markus\\.gitconfig.lock')
      } else {
        expect(
          parseConfigLockFilePathFromError(
            createGitResult(
              'error: could not lock config file /Users/markus/.gitconfig: File exists'
            )
          )
        ).toBe('/Users/markus/.gitconfig.lock')
      }
    })
  })
})
