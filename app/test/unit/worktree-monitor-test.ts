import assert from 'node:assert'
import { describe, it, type TestContext } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import * as Path from 'path'
import { realpath } from 'fs/promises'
import { exec } from 'dugite'
import { Repository } from '../../src/models/repository'
import { setupEmptyRepository } from '../helpers/repositories'
import { makeCommit } from '../helpers/repository-scaffolding'
import { createTempDirectory } from '../helpers/temp'
import {
  getWorktreesDirectory,
  monitorWorktrees,
} from '../../src/lib/stores/helpers/worktree-monitor'

const interval = 10

/** Run Git, failing the test if it fails. */
async function git(args: ReadonlyArray<string>, path: string) {
  const { exitCode, stdout, stderr } = await exec([...args], path)
  assert.strictEqual(exitCode, 0, stderr)
  return stdout
}

async function setupRepository(t: TestContext) {
  const repository = await setupEmptyRepository(t, 'main')
  await makeCommit(repository, {
    entries: [{ path: 'README', contents: 'hello' }],
  })
  return repository
}

/** Add a linked worktree, like the GitHub Copilot app does for a session. */
async function addWorktree(
  t: TestContext,
  repository: Repository,
  branch: string,
  options: ReadonlyArray<string> = []
) {
  const path = Path.join(await createTempDirectory(t), branch)
  await git(
    ['worktree', 'add', ...options, '-b', branch, '--', path],
    repository.path
  )
  return path
}

async function getGitDir(path: string) {
  return (await git(['rev-parse', '--absolute-git-dir'], path)).trim()
}

async function waitFor(condition: () => boolean, description: string) {
  for (let elapsed = 0; !condition(); elapsed += interval) {
    if (elapsed > 5000) {
      throw new Error(`Timed out waiting for ${description}`)
    }
    await delay(interval)
  }
}

/**
 * Monitor the worktrees for the rest of the test, counting the changes noticed
 * and the times the monitor has looked for them.
 */
async function monitor(t: TestContext, gitDir: string) {
  // The monitor schedules every look for changes, starting once it has taken
  // stock of the worktrees there are to begin with.
  const scheduled = t.mock.method(window, 'setTimeout')
  const monitored = {
    changes: 0,
    looks: () => scheduled.mock.callCount() - 1,
    stop: () => {},
  }
  monitored.stop = monitorWorktrees(gitDir, () => monitored.changes++, interval)
  t.after(() => monitored.stop())

  await waitFor(() => scheduled.mock.callCount() > 0, 'the monitor to start')

  return monitored
}

function waitForChange(monitored: { readonly changes: number }) {
  return waitFor(() => monitored.changes > 0, 'the worktrees to change')
}

/** Wait for the monitor to have looked for changes a few more times. */
function waitForLooks(monitored: { readonly looks: () => number }) {
  const looks = monitored.looks()
  return waitFor(() => monitored.looks() > looks + 2, 'the monitor to look')
}

describe('worktree-monitor', () => {
  describe('getWorktreesDirectory', () => {
    it('is in the git dir of the main worktree', async t => {
      const repository = await setupRepository(t)
      const gitDir = await getGitDir(repository.path)

      assert.strictEqual(
        await getWorktreesDirectory(gitDir),
        Path.join(gitDir, 'worktrees')
      )
    })

    it('is in the common git dir for a linked worktree', async t => {
      const repository = await setupRepository(t)
      const worktreePath = await addWorktree(t, repository, 'feature')

      const worktreesDirectory = await getWorktreesDirectory(
        await getGitDir(worktreePath)
      )

      assert.strictEqual(
        await realpath(Path.dirname(worktreesDirectory)),
        await realpath(await getGitDir(repository.path))
      )
      assert.strictEqual(Path.basename(worktreesDirectory), 'worktrees')
    })

    it('follows the .git file of a linked worktree', async t => {
      const repository = await setupRepository(t)
      const worktreePath = await addWorktree(t, repository, 'feature', [
        '--relative-paths',
      ])

      const worktreesDirectory = await getWorktreesDirectory(
        Path.join(worktreePath, '.git')
      )

      assert.strictEqual(
        await realpath(Path.dirname(worktreesDirectory)),
        await realpath(await getGitDir(repository.path))
      )
      assert.strictEqual(Path.basename(worktreesDirectory), 'worktrees')
    })
  })

  describe('monitorWorktrees', () => {
    it('notices a worktree being added', async t => {
      const repository = await setupRepository(t)
      const monitored = await monitor(t, await getGitDir(repository.path))

      await addWorktree(t, repository, 'feature')

      await waitForChange(monitored)
    })

    it('notices a worktree being removed', async t => {
      const repository = await setupRepository(t)
      const worktreePath = await addWorktree(t, repository, 'feature')
      const monitored = await monitor(t, await getGitDir(repository.path))

      await git(['worktree', 'remove', '--', worktreePath], repository.path)

      await waitForChange(monitored)
    })

    it('notices a worktree being unlocked', async t => {
      // Git locks a worktree while adding it, so it mustn't seem locked after.
      const repository = await setupRepository(t)
      const worktreePath = await addWorktree(t, repository, 'feature', [
        '--lock',
      ])
      const monitored = await monitor(t, await getGitDir(repository.path))

      await git(['worktree', 'unlock', '--', worktreePath], repository.path)

      await waitForChange(monitored)
    })

    it('notices a worktree being added when a linked worktree is selected', async t => {
      const repository = await setupRepository(t)
      const worktreePath = await addWorktree(t, repository, 'feature')
      const monitored = await monitor(t, await getGitDir(worktreePath))

      await addWorktree(t, repository, 'other-feature')

      await waitForChange(monitored)
    })

    it('notices a worktree being added before the git dir of a linked worktree is known', async t => {
      // Repositories whose git dir hasn't been recorded fall back to the .git
      // file in their working directory.
      const repository = await setupRepository(t)
      const worktreePath = await addWorktree(t, repository, 'feature')
      const { resolvedGitDir } = new Repository(worktreePath, 1, null, false)
      const monitored = await monitor(t, resolvedGitDir)

      await addWorktree(t, repository, 'other-feature')

      await waitForChange(monitored)
    })

    it('ignores other changes to the repository', async t => {
      const repository = await setupRepository(t)
      const worktreePath = await addWorktree(t, repository, 'feature')
      const monitored = await monitor(t, await getGitDir(repository.path))

      await makeCommit(repository, {
        entries: [{ path: 'README', contents: 'hello again' }],
      })
      await git(['switch', '-c', 'other-feature'], worktreePath)
      await waitForLooks(monitored)

      assert.strictEqual(monitored.changes, 0)
    })

    it('stops monitoring when asked to', async t => {
      const repository = await setupRepository(t)
      const monitored = await monitor(t, await getGitDir(repository.path))

      monitored.stop()
      await addWorktree(t, repository, 'feature')
      await delay(interval * 25)

      assert.strictEqual(monitored.changes, 0)
    })
  })
})
