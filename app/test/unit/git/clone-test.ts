import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as path from 'path'
import { existsSync } from 'fs'

import { clone } from '../../../src/lib/git/clone'
import { setupEmptyRepository } from '../../helpers/repositories'
import { makeCommit } from '../../helpers/repository-scaffolding'
import { createTempDirectory } from '../../helpers/temp'
import { exec } from 'dugite'
import { git } from '../../../src/lib/git'

async function createEmptyBareRepository(
  t: import('node:test').TestContext
): Promise<string> {
  const bareParentPath = await createTempDirectory(t)
  const barePath = path.join(bareParentPath, 'remote.git')
  await git(['init', '--bare', barePath], bareParentPath, 'initBareRepository')
  return barePath
}

describe('git/clone', () => {
  it('clones a local repository', async t => {
    // Create a source repo with a commit
    const source = await setupEmptyRepository(t)
    await makeCommit(source, {
      entries: [{ path: 'README.md', contents: 'hello' }],
      commitMessage: 'initial commit',
    })

    const destPath = await createTempDirectory(t)
    const clonePath = path.join(destPath, 'cloned')

    await clone(source.path, clonePath, {})

    assert.equal(existsSync(path.join(clonePath, '.git')), true)
    assert.equal(existsSync(path.join(clonePath, 'README.md')), true)
  })

  it('clones with a specific branch', async t => {
    const source = await setupEmptyRepository(t)
    await makeCommit(source, {
      entries: [{ path: 'README.md', contents: 'hello' }],
      commitMessage: 'initial commit',
    })

    // Create a feature branch on the source
    await exec(['branch', 'feature'], source.path)
    await exec(['checkout', 'feature'], source.path)
    await makeCommit(source, {
      entries: [{ path: 'feature.txt', contents: 'feature' }],
      commitMessage: 'feature commit',
    })
    await exec(['checkout', 'master'], source.path)

    const destPath = await createTempDirectory(t)
    const clonePath = path.join(destPath, 'cloned')

    await clone(source.path, clonePath, { branch: 'feature' })

    // Verify the feature branch was checked out
    const result = await exec(['rev-parse', '--abbrev-ref', 'HEAD'], clonePath)
    assert.equal(result.stdout.trim(), 'feature')
    assert.equal(existsSync(path.join(clonePath, 'feature.txt')), true)
  })

  it('reports progress when callback is provided', async t => {
    const source = await setupEmptyRepository(t)
    await makeCommit(source, {
      entries: [{ path: 'README.md', contents: 'hello' }],
      commitMessage: 'initial commit',
    })

    const destPath = await createTempDirectory(t)
    const clonePath = path.join(destPath, 'cloned')

    const progressEvents: Array<{ kind: string }> = []
    await clone(source.path, clonePath, {}, progress => {
      progressEvents.push({ kind: progress.kind })
    })

    assert.ok(progressEvents.length > 0, 'Expected at least one progress event')
    assert.equal(progressEvents[0].kind, 'clone')
  })

  it('clones with a custom default branch name', async t => {
    // init.defaultBranch only takes effect when the remote's unborn HEAD
    // branch name is not advertised (protocol v0/v1). Force protocol v0
    // so we can verify the option actually drives the result, rather than
    // having the remote's initial-branch setting do the work.
    const savedGitConfigParams = process.env['GIT_CONFIG_PARAMETERS']
    process.env['GIT_CONFIG_PARAMETERS'] = "'protocol.version=0'"
    t.after(() => {
      if (savedGitConfigParams === undefined) {
        delete process.env['GIT_CONFIG_PARAMETERS']
      } else {
        process.env['GIT_CONFIG_PARAMETERS'] = savedGitConfigParams
      }
    })

    // Bare repo defaults to 'master' — clone must use defaultBranch to get 'trunk'
    const source = await createEmptyBareRepository(t)

    const destPath = await createTempDirectory(t)
    const clonePath = path.join(destPath, 'cloned')

    await clone(source, clonePath, { defaultBranch: 'trunk' })

    assert.equal(existsSync(path.join(clonePath, '.git')), true)

    const result = await exec(['symbolic-ref', 'HEAD'], clonePath)
    assert.equal(result.stdout.trim(), 'refs/heads/trunk')
  })
})
