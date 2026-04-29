import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  canUseWSLGit,
  isWSLSafeGitSubcommand,
} from '../../../src/lib/git/wsl-git-exec'

describe('wsl-git-exec', () => {
  describe('isWSLSafeGitSubcommand', () => {
    it('returns true for status', () => {
      assert.equal(
        isWSLSafeGitSubcommand(['--no-optional-locks', 'status', '--porcelain=2']),
        true
      )
    })

    it('returns true for log', () => {
      assert.equal(isWSLSafeGitSubcommand(['log', '--oneline', '-10']), true)
    })

    it('returns true for diff', () => {
      assert.equal(isWSLSafeGitSubcommand(['diff', '--name-only']), true)
    })

    it('returns true for branch', () => {
      assert.equal(isWSLSafeGitSubcommand(['branch', '-vv']), true)
    })

    it('returns true for rev-list', () => {
      assert.equal(isWSLSafeGitSubcommand(['rev-list', 'HEAD..origin/main']), true)
    })

    it('returns false for push', () => {
      assert.equal(isWSLSafeGitSubcommand(['push', 'origin', 'main']), false)
    })

    it('returns false for commit', () => {
      assert.equal(isWSLSafeGitSubcommand(['commit', '-m', 'test']), false)
    })

    it('returns false for fetch', () => {
      assert.equal(isWSLSafeGitSubcommand(['fetch', 'origin']), false)
    })

    it('returns false for pull', () => {
      assert.equal(isWSLSafeGitSubcommand(['pull']), false)
    })

    it('returns false for clone', () => {
      assert.equal(isWSLSafeGitSubcommand(['clone', 'url']), false)
    })

    it('returns false for empty args', () => {
      assert.equal(isWSLSafeGitSubcommand([]), false)
    })

    it('returns false for flags only', () => {
      assert.equal(isWSLSafeGitSubcommand(['--no-optional-locks']), false)
    })

    it('skips -c key=value pairs to find subcommand', () => {
      assert.equal(
        isWSLSafeGitSubcommand(
          ['--no-optional-locks', '-c', 'core.fsmonitor=', 'status']
        ),
        true
      )
    })

    it('skips -C path pairs to find subcommand', () => {
      assert.equal(
        isWSLSafeGitSubcommand(['-C', '/some/path', 'log', '--oneline']),
        true
      )
    })
  })

  describe('canUseWSLGit', () => {
    const wslPath = '\\\\wsl$\\Ubuntu\\home\\user\\repo'
    const windowsPath = 'C:\\Users\\user\\repo'

    it('returns false for non-WSL paths regardless of platform', () => {
      assert.equal(
        canUseWSLGit(['status', '--porcelain=2'], windowsPath),
        false
      )
    })

    it('returns false on non-Windows platforms', () => {
      if (__WIN32__) {
        return
      }
      assert.equal(canUseWSLGit(['status'], wslPath), false)
    })

    it('returns false for empty args', () => {
      assert.equal(canUseWSLGit([], wslPath), false)
    })

    it('returns false for unsafe subcommands on WSL paths', () => {
      assert.equal(canUseWSLGit(['push', 'origin', 'main'], wslPath), false)
    })
  })
})
