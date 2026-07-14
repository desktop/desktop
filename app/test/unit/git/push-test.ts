import { describe, it } from 'node:test'
import assert from 'node:assert'

import { push } from '../../../src/lib/git/push'
import { setupEmptyRepository } from '../../helpers/repositories'
import { makeCommit } from '../../helpers/repository-scaffolding'
import { IRemote } from '../../../src/models/remote'
import { exec } from 'dugite'
import { Repository } from '../../../src/models/repository'
import { createTempDirectory } from '../../helpers/temp'
import { writeFile } from 'fs/promises'

/**
 * Creates a bare clone of a repository to use as an upstream remote.
 * Bare repos accept pushes to any branch.
 */
async function createBareUpstream(
  t: import('node:test').TestContext,
  source: Repository
): Promise<string> {
  const barePath = await createTempDirectory(t)
  await exec(['clone', '--bare', source.path, barePath], source.path)
  return barePath
}

describe('git/push', () => {
  it('pushes commits to a local remote', async t => {
    const repo = await setupEmptyRepository(t)
    await makeCommit(repo, {
      entries: [{ path: 'README.md', contents: 'initial' }],
      commitMessage: 'initial commit',
    })

    // Create a bare upstream and add it as origin
    const barePath = await createBareUpstream(t, repo)
    await exec(['remote', 'add', 'origin', barePath], repo.path)

    // Create a new commit to push
    await makeCommit(repo, {
      entries: [{ path: 'new-file.txt', contents: 'new content' }],
      commitMessage: 'add new file',
    })

    const remote: IRemote = { name: 'origin', url: barePath }
    await push(repo, remote, 'master', 'master', null)

    // Verify the bare upstream received the commit
    const result = await exec(['log', '--oneline'], barePath)
    assert.ok(result.stdout.includes('add new file'))
  })

  it('pushes with --set-upstream for a new branch', async t => {
    const repo = await setupEmptyRepository(t)
    await makeCommit(repo, {
      entries: [{ path: 'README.md', contents: 'initial' }],
      commitMessage: 'initial commit',
    })

    const barePath = await createBareUpstream(t, repo)
    await exec(['remote', 'add', 'origin', barePath], repo.path)

    // Create and switch to a new branch
    await exec(['checkout', '-b', 'new-branch'], repo.path)
    await makeCommit(repo, {
      entries: [{ path: 'branch-file.txt', contents: 'branch content' }],
      commitMessage: 'branch commit',
    })

    const remote: IRemote = { name: 'origin', url: barePath }

    // Push with remoteBranch=null should set upstream
    await push(repo, remote, 'new-branch', null, null)

    // Verify the branch exists on the bare upstream
    const result = await exec(['rev-parse', '--verify', 'new-branch'], barePath)
    assert.equal(result.exitCode, 0)

    const upstream = await exec(
      ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
      repo.path
    )
    assert.equal(upstream.stdout.trim(), 'origin/new-branch')
  })

  it('pushes with force-with-lease', async t => {
    const repo = await setupEmptyRepository(t)
    await makeCommit(repo, {
      entries: [{ path: 'README.md', contents: 'initial' }],
      commitMessage: 'initial commit',
    })

    await makeCommit(repo, {
      entries: [{ path: 'README.md', contents: 'before rewrite' }],
      commitMessage: 'commit before rewrite',
    })

    const barePath = await createBareUpstream(t, repo)
    await exec(['remote', 'add', 'origin', barePath], repo.path)

    const remote: IRemote = { name: 'origin', url: barePath }
    await push(repo, remote, 'master', 'master', null)

    await exec(['reset', '--hard', 'HEAD~1'], repo.path)
    await writeFile(`${repo.path}/README.md`, 'rewritten history')
    await exec(['add', 'README.md'], repo.path)
    await exec(['commit', '-m', 'rewritten commit'], repo.path)

    await assert.rejects(push(repo, remote, 'master', 'master', null))

    await push(repo, remote, 'master', 'master', null, {
      forceWithLease: true,
    })

    // Verify the bare upstream has the rewritten commit
    const result = await exec(['log', '--oneline', '-1'], barePath)
    assert.ok(result.stdout.includes('rewritten commit'))
  })

  it('reports progress when callback is provided', async t => {
    const repo = await setupEmptyRepository(t)
    await makeCommit(repo, {
      entries: [{ path: 'README.md', contents: 'initial' }],
      commitMessage: 'initial commit',
    })

    const barePath = await createBareUpstream(t, repo)
    await exec(['remote', 'add', 'origin', barePath], repo.path)

    await makeCommit(repo, {
      entries: [{ path: 'file.txt', contents: 'content' }],
      commitMessage: 'new commit',
    })

    const remote: IRemote = { name: 'origin', url: barePath }
    const progressEvents: Array<{ kind: string }> = []

    await push(repo, remote, 'master', 'master', null, undefined, progress => {
      progressEvents.push({ kind: progress.kind })
    })

    // At minimum we should get the initial progress event
    assert.ok(progressEvents.length > 0, 'Expected at least one progress event')
    assert.equal(progressEvents[0].kind, 'push')
  })
})
