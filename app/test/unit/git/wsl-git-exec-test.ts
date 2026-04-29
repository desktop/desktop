import { describe, it } from 'node:test'
import assert from 'node:assert'
import { canUseWSLGit } from '../../../src/lib/git/wsl-git-exec'

describe('wsl-git-exec', () => {
  describe('canUseWSLGit', () => {
    const wslPath = '\\\\wsl$\\Ubuntu\\home\\user\\repo'
    const windowsPath = 'C:\\Users\\user\\repo'

    it('returns true for read-only git commands on WSL paths', () => {
      if (!__WIN32__) {
        return
      }
      assert.equal(
        canUseWSLGit(['--no-optional-locks', 'status', '--porcelain=2'], wslPath),
        true
      )
    })

    it('returns true for git log on WSL paths', () => {
      if (!__WIN32__) {
        return
      }
      assert.equal(canUseWSLGit(['log', '--oneline', '-10'], wslPath), true)
    })

    it('returns true for git diff on WSL paths', () => {
      if (!__WIN32__) {
        return
      }
      assert.equal(canUseWSLGit(['diff', '--name-only'], wslPath), true)
    })

    it('returns false for git push (needs credentials)', () => {
      assert.equal(canUseWSLGit(['push', 'origin', 'main'], wslPath), false)
    })

    it('returns false for git commit (needs hooks)', () => {
      assert.equal(canUseWSLGit(['commit', '-m', 'test'], wslPath), false)
    })

    it('returns false for git fetch (needs credentials)', () => {
      assert.equal(canUseWSLGit(['fetch', 'origin'], wslPath), false)
    })

    it('returns false for git pull (needs credentials)', () => {
      assert.equal(canUseWSLGit(['pull'], wslPath), false)
    })

    it('returns false for non-WSL paths', () => {
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

    it('correctly skips flag-only args to find subcommand', () => {
      if (!__WIN32__) {
        return
      }
      assert.equal(
        canUseWSLGit(
          ['--no-optional-locks', '-c', 'core.fsmonitor=', 'status'],
          wslPath
        ),
        true
      )
    })
  })
})
