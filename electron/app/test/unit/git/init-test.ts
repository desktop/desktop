import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as path from 'path'
import { existsSync } from 'fs'

import { initGitRepository } from '../../../src/lib/git/init'
import { getDefaultBranch } from '../../../src/lib/helpers/default-branch'
import { getStatus } from '../../../src/lib/git'
import { createTempDirectory } from '../../helpers/temp'
import { exec } from 'dugite'

describe('git/init', () => {
  it('creates a new git repository', async t => {
    const tempDir = await createTempDirectory(t)
    await initGitRepository(tempDir)

    const gitDir = path.join(tempDir, '.git')
    assert.equal(existsSync(gitDir), true)
  })

  it('creates a repository with a default branch', async t => {
    const tempDir = await createTempDirectory(t)
    await initGitRepository(tempDir)

    const { Repository } = await import('../../../src/models/repository')
    const repo = new Repository(tempDir, -1, null, false)
    const status = await getStatus(repo)
    assert.notEqual(status, null)
    assert.equal(status!.exists, true)

    const head = await exec(['symbolic-ref', '--short', 'HEAD'], tempDir)
    assert.equal(head.stdout.trim(), await getDefaultBranch())
  })
})
