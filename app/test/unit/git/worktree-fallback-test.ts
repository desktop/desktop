import assert from 'node:assert'
import * as Path from 'path'
import { describe, it } from 'node:test'
import { exec } from 'dugite'
import { realpath, rm } from 'fs/promises'

import { Repository } from '../../../src/models/repository'
import {
  getMainWorktree,
  getRepositoryType,
  listWorktrees,
} from '../../../src/lib/git'
import { pathExists } from '../../../src/lib/path-exists'
import { setupEmptyRepository } from '../../helpers/repositories'
import { makeCommit } from '../../helpers/repository-scaffolding'
import { createTempDirectory } from '../../helpers/temp'

/**
 * When the app is "on" a linked worktree and that worktree directory is removed
 * from disk (e.g. by an agent), the app should fall back to the main worktree
 * rather than reporting the repository as missing and forcing a re-add.
 */
describe('git/worktree removal fallback', () => {
  it('falls back to the main worktree when the linked worktree directory is removed', async t => {
    // Arrange: a repository with a linked worktree, mirroring what the app
    // persists when a user switches into a worktree.
    const mainRepo = await setupEmptyRepository(t, 'main')
    await makeCommit(mainRepo, {
      entries: [{ path: 'README', contents: 'hello' }],
    })

    const linkedPath = mainRepo.path + '-wt-feature'
    await exec(['worktree', 'add', '-b', 'feature', linkedPath], mainRepo.path)

    // The app resolves and stores the worktree's gitDir on add/switch, so build
    // the Repository exactly as the app would have it while on the worktree.
    const linkedType = await getRepositoryType(linkedPath)
    assert.strictEqual(linkedType.kind, 'regular')
    const linkedGitDir =
      linkedType.kind === 'regular' ? linkedType.gitDir : undefined

    const repository = new Repository(
      linkedPath,
      1,
      null,
      false, // missing
      null,
      {},
      false,
      linkedGitDir
    )

    // Sanity: the main worktree is discoverable while everything is intact.
    const before = await listWorktrees(repository.resolvedGitDir)
    assert(
      before.some(w => w.type === 'main'),
      'expected a main worktree to exist before removal'
    )

    // Act: an external tool removes the worktree's working directory. The
    // administrative git dir under .git/worktrees/<name> survives.
    await rm(linkedPath, { recursive: true, force: true })

    // The removed worktree working dir is gone...
    assert.strictEqual(await pathExists(repository.path), false)
    // ...and the current path-based detection is exactly what makes the app
    // show "Can't find this repository".
    assert.strictEqual(
      (await getRepositoryType(repository.path)).kind,
      'missing'
    )

    // Assert: the app can recover to the main worktree, which still exists.
    const fallback = await getMainWorktree(repository)

    assert.notStrictEqual(
      fallback,
      null,
      'expected a fallback to the main worktree, but got none (repository treated as missing)'
    )
    assert.strictEqual(fallback!.type, 'main')
    assert.strictEqual(await pathExists(fallback!.path), true)
    assert.strictEqual(
      Path.normalize(await realpath(fallback!.path)),
      Path.normalize(await realpath(mainRepo.path)),
      'fallback should resolve to the main worktree'
    )
  })

  it('does not fall back for a regular repository that has been removed', async t => {
    // A plain (non-worktree) repository that is deleted has no main worktree to
    // recover to — its git dir is gone too — so it must stay "missing".
    //
    // The repo lives in a subdirectory so we can remove it while leaving the
    // temp root for the helper's automatic cleanup.
    const tempDirectory = await createTempDirectory(t)
    const repoPath = Path.join(tempDirectory, 'regular-repo')
    await exec(['init', '-b', 'main', repoPath], tempDirectory)

    const repository = new Repository(repoPath, 1, null, false)
    await makeCommit(repository, {
      entries: [{ path: 'README', contents: 'hello' }],
    })

    const type = await getRepositoryType(repoPath)
    assert.strictEqual(type.kind, 'regular')

    await rm(repoPath, { recursive: true, force: true })

    assert.strictEqual(await pathExists(repository.path), false)
    assert.strictEqual(await getMainWorktree(repository), null)
  })
})
