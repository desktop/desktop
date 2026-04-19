import assert from 'node:assert'
import { mkdir, writeFile } from 'node:fs/promises'
import * as path from 'node:path'
import { describe, it } from 'node:test'
import {
  getWorktreePathInfoSync,
  parseWorktreePorcelainOutput,
} from '../../../src/lib/git/worktree'
import { createTempDirectory } from '../helpers/temp'

describe('git/worktree', () => {
  describe('parseWorktreePorcelainOutput', () => {
    it('returns empty array for empty output', () => {
      assert.deepStrictEqual(parseWorktreePorcelainOutput(''), [])
      assert.deepStrictEqual(parseWorktreePorcelainOutput('  \n  '), [])
    })

    it('parses a single main worktree', () => {
      const output = [
        'worktree /path/to/repo',
        'HEAD abc1234abc1234abc1234abc1234abc1234abc123',
        'branch refs/heads/main',
        '',
      ].join('\n')

      const entries = parseWorktreePorcelainOutput(output)
      assert.strictEqual(entries.length, 1)
      assert.deepStrictEqual(entries[0], {
        path: '/path/to/repo',
        head: 'abc1234abc1234abc1234abc1234abc1234abc123',
        branch: 'refs/heads/main',
        isDetached: false,
        type: 'main',
        isLocked: false,
        isPrunable: false,
      })
    })

    it('parses multiple worktrees', () => {
      const output = [
        'worktree /path/to/repo',
        'HEAD abc1234abc1234abc1234abc1234abc1234abc123',
        'branch refs/heads/main',
        '',
        'worktree /path/to/linked',
        'HEAD def5678def5678def5678def5678def5678def567',
        'branch refs/heads/feature',
        '',
      ].join('\n')

      const entries = parseWorktreePorcelainOutput(output)
      assert.strictEqual(entries.length, 2)

      assert.strictEqual(entries[0].type, 'main')
      assert.strictEqual(entries[0].path, '/path/to/repo')

      assert.strictEqual(entries[1].type, 'linked')
      assert.strictEqual(entries[1].path, '/path/to/linked')
      assert.strictEqual(entries[1].branch, 'refs/heads/feature')
    })

    it('parses detached HEAD worktree', () => {
      const output = [
        'worktree /path/to/repo',
        'HEAD abc1234abc1234abc1234abc1234abc1234abc123',
        'branch refs/heads/main',
        '',
        'worktree /path/to/detached',
        'HEAD def5678def5678def5678def5678def5678def567',
        'detached',
        '',
      ].join('\n')

      const entries = parseWorktreePorcelainOutput(output)
      assert.strictEqual(entries.length, 2)

      assert.strictEqual(entries[1].isDetached, true)
      assert.strictEqual(entries[1].branch, null)
    })

    it('parses locked worktree', () => {
      const output = [
        'worktree /path/to/repo',
        'HEAD abc1234abc1234abc1234abc1234abc1234abc123',
        'branch refs/heads/main',
        '',
        'worktree /path/to/locked-wt',
        'HEAD def5678def5678def5678def5678def5678def567',
        'branch refs/heads/locked-branch',
        'locked',
        '',
      ].join('\n')

      const entries = parseWorktreePorcelainOutput(output)
      assert.strictEqual(entries[1].isLocked, true)
    })

    it('parses locked worktree with reason', () => {
      const output = [
        'worktree /path/to/repo',
        'HEAD abc1234abc1234abc1234abc1234abc1234abc123',
        'branch refs/heads/main',
        '',
        'worktree /path/to/locked-wt',
        'HEAD def5678def5678def5678def5678def5678def567',
        'branch refs/heads/locked-branch',
        'locked reason why it is locked',
        '',
      ].join('\n')

      const entries = parseWorktreePorcelainOutput(output)
      assert.strictEqual(entries[1].isLocked, true)
    })

    it('parses prunable worktree', () => {
      const output = [
        'worktree /path/to/repo',
        'HEAD abc1234abc1234abc1234abc1234abc1234abc123',
        'branch refs/heads/main',
        '',
        'worktree /path/to/prunable-wt',
        'HEAD def5678def5678def5678def5678def5678def567',
        'branch refs/heads/stale',
        'prunable gitdir file points to non-existent location',
        '',
      ].join('\n')

      const entries = parseWorktreePorcelainOutput(output)
      assert.strictEqual(entries[1].isPrunable, true)
    })

    it('parses paths with spaces', () => {
      const output = [
        'worktree /path/to/my repo',
        'HEAD abc1234abc1234abc1234abc1234abc1234abc123',
        'branch refs/heads/main',
        '',
        'worktree /path/to/my other worktree',
        'HEAD def5678def5678def5678def5678def5678def567',
        'branch refs/heads/feature',
        '',
      ].join('\n')

      const entries = parseWorktreePorcelainOutput(output)
      assert.strictEqual(entries[0].path, '/path/to/my repo')
      assert.strictEqual(entries[1].path, '/path/to/my other worktree')
    })

    it('parses worktree with locked and prunable flags combined', () => {
      const output = [
        'worktree /path/to/repo',
        'HEAD abc1234abc1234abc1234abc1234abc1234abc123',
        'branch refs/heads/main',
        '',
        'worktree /path/to/bad-wt',
        'HEAD def5678def5678def5678def5678def5678def567',
        'detached',
        'locked',
        'prunable',
        '',
      ].join('\n')

      const entries = parseWorktreePorcelainOutput(output)
      assert.strictEqual(entries[1].isDetached, true)
      assert.strictEqual(entries[1].isLocked, true)
      assert.strictEqual(entries[1].isPrunable, true)
      assert.strictEqual(entries[1].branch, null)
    })
  })

  describe('getWorktreePathInfoSync', () => {
    it('detects a main worktree from a .git directory', async t => {
      const directory = await createTempDirectory(t)
      const gitDir = path.join(directory, '.git')

      await mkdir(gitDir, { recursive: true })

      assert.deepStrictEqual(getWorktreePathInfoSync(directory), {
        isLinkedWorktree: false,
        mainWorktreePath: directory,
      })
    })

    it('detects a linked worktree and resolves its main worktree path', async t => {
      const directory = await createTempDirectory(t)
      const worktreeDir = path.join(directory, 'worktree')
      const commonGitDir = path.join(directory, 'repo.git')
      const worktreeGitDir = path.join(commonGitDir, 'worktrees', 'desktop-test')

      await mkdir(worktreeDir, { recursive: true })
      await mkdir(worktreeGitDir, { recursive: true })

      await writeFile(
        path.join(worktreeDir, '.git'),
        'gitdir: ../repo.git/worktrees/desktop-test\n'
      )
      await writeFile(path.join(worktreeGitDir, 'commondir'), '../..\n')

      assert.deepStrictEqual(getWorktreePathInfoSync(worktreeDir), {
        isLinkedWorktree: true,
        mainWorktreePath: directory,
      })
    })
  })
})
