import assert from 'node:assert'
import { mkdir, writeFile } from 'fs/promises'
import * as path from 'path'
import { describe, it } from 'node:test'

import { getSHA } from '../../git-info'
import { createTempDirectory } from '../helpers/temp'

describe('getSHA', () => {
  it('reads HEAD from a standard .git directory', async t => {
    const directory = await createTempDirectory(t)
    const gitDir = path.join(directory, '.git')
    const sha = '0123456789abcdef0123456789abcdef01234567'

    await mkdir(path.join(gitDir, 'refs', 'heads'), { recursive: true })
    await writeFile(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main\n')
    await writeFile(path.join(gitDir, 'refs', 'heads', 'main'), `${sha}\n`)

    assert.equal(getSHA(gitDir), sha)
  })

  it('reads HEAD from a linked worktree .git file', async t => {
    const directory = await createTempDirectory(t)
    const worktreeDir = path.join(directory, 'worktree')
    const commonGitDir = path.join(directory, 'repo.git')
    const worktreeGitDir = path.join(commonGitDir, 'worktrees', 'desktop-test')
    const sha = '89abcdef0123456789abcdef0123456789abcdef'

    await mkdir(worktreeDir, { recursive: true })
    await mkdir(path.join(worktreeGitDir), { recursive: true })
    await mkdir(path.join(commonGitDir, 'refs', 'heads'), { recursive: true })

    await writeFile(
      path.join(worktreeDir, '.git'),
      'gitdir: ../repo.git/worktrees/desktop-test\n'
    )
    await writeFile(path.join(worktreeGitDir, 'HEAD'), 'ref: refs/heads/main\n')
    await writeFile(path.join(worktreeGitDir, 'commondir'), '../..\n')
    await writeFile(
      path.join(commonGitDir, 'refs', 'heads', 'main'),
      `${sha}\n`
    )

    assert.equal(getSHA(path.join(worktreeDir, '.git')), sha)
  })

  it('reads packed refs from a linked worktree common git dir', async t => {
    const directory = await createTempDirectory(t)
    const worktreeDir = path.join(directory, 'worktree')
    const commonGitDir = path.join(directory, 'repo.git')
    const worktreeGitDir = path.join(commonGitDir, 'worktrees', 'desktop-test')
    const sha = 'fedcba9876543210fedcba9876543210fedcba98'

    await mkdir(worktreeDir, { recursive: true })
    await mkdir(path.join(worktreeGitDir), { recursive: true })
    await mkdir(commonGitDir, { recursive: true })

    await writeFile(
      path.join(worktreeDir, '.git'),
      'gitdir: ../repo.git/worktrees/desktop-test\n'
    )
    await writeFile(path.join(worktreeGitDir, 'HEAD'), 'ref: refs/heads/main\n')
    await writeFile(path.join(worktreeGitDir, 'commondir'), '../..\n')
    await writeFile(
      path.join(commonGitDir, 'packed-refs'),
      `${sha} refs/heads/main\n`
    )

    assert.equal(getSHA(path.join(worktreeDir, '.git')), sha)
  })
})
