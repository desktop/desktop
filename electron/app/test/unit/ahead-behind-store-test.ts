import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { AheadBehindStore } from '../../src/lib/stores/ahead-behind-store'
import { Repository } from '../../src/models/repository'
import { setupEmptyRepository } from '../helpers/repositories'
import {
  makeCommit,
  createBranch,
  switchTo,
} from '../helpers/repository-scaffolding'
import { exec } from 'dugite'
import { IAheadBehind } from '../../src/models/branch'

async function getSHA(repo: Repository): Promise<string> {
  const result = await exec(['rev-parse', 'HEAD'], repo.path)
  return result.stdout.trim()
}

async function waitForAheadBehind(
  store: AheadBehindStore,
  repo: Repository,
  from: string,
  to: string
): Promise<IAheadBehind> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(
        new Error(
          `Timed out waiting for ahead/behind result for range ${from}...${to}`
        )
      )
    }, 5_000)

    store.getAheadBehind(repo, from, to, aheadBehind => {
      clearTimeout(timeout)
      resolve(aheadBehind)
    })
  })
}

describe('AheadBehindStore', () => {
  let store: AheadBehindStore

  beforeEach(() => {
    store = new AheadBehindStore()
  })

  describe('tryGetAheadBehind', () => {
    it('returns undefined for uncached range', () => {
      const repo = new Repository('/fake/path', -1, null, false)
      const result = store.tryGetAheadBehind(repo, 'abc123', 'def456')
      assert.equal(result, undefined)
    })
  })

  describe('getAheadBehind', () => {
    it('calculates ahead/behind for diverged branches', async t => {
      const repo = await setupEmptyRepository(t)

      // Create initial commit on master
      await makeCommit(repo, {
        entries: [{ path: 'base.txt', contents: 'base' }],
        commitMessage: 'initial commit',
      })

      // Create a feature branch and add a commit
      await createBranch(repo, 'feature', 'HEAD')
      await switchTo(repo, 'feature')
      await makeCommit(repo, {
        entries: [{ path: 'feature.txt', contents: 'feature work' }],
        commitMessage: 'feature commit',
      })
      const featureSHA = await getSHA(repo)

      // Go back to master and add a different commit
      await switchTo(repo, 'master')
      await makeCommit(repo, {
        entries: [{ path: 'main.txt', contents: 'main work' }],
        commitMessage: 'main commit',
      })
      const mainSHA = await getSHA(repo)

      // Now get the ahead/behind count
      const result = await waitForAheadBehind(store, repo, mainSHA, featureSHA)

      assert.notEqual(result, undefined)
      // master is 1 ahead (its own commit) and 1 behind (the feature commit)
      assert.equal(result!.ahead, 1)
      assert.equal(result!.behind, 1)
    })

    it('returns cached result on subsequent calls', async t => {
      const repo = await setupEmptyRepository(t)

      await makeCommit(repo, {
        entries: [{ path: 'base.txt', contents: 'base' }],
        commitMessage: 'initial commit',
      })

      await createBranch(repo, 'feature', 'HEAD')
      await switchTo(repo, 'feature')
      await makeCommit(repo, {
        entries: [{ path: 'feature.txt', contents: 'feature' }],
        commitMessage: 'feature commit',
      })
      const featureSHA = await getSHA(repo)

      await switchTo(repo, 'master')
      const mainSHA = await getSHA(repo)

      // First call — populates cache
      await waitForAheadBehind(store, repo, mainSHA, featureSHA)

      // Second call — should return cached result synchronously
      const cached = store.tryGetAheadBehind(repo, mainSHA, featureSHA)
      assert.notEqual(cached, undefined)
      // master is 0 ahead, 1 behind (feature has 1 extra commit)
      assert.equal(cached!.ahead, 0)
      assert.equal(cached!.behind, 1)
    })

    it('supports aborting via disposable', async t => {
      const repo = await setupEmptyRepository(t)

      await makeCommit(repo, {
        entries: [{ path: 'base.txt', contents: 'base' }],
        commitMessage: 'initial commit',
      })

      await createBranch(repo, 'feature', 'HEAD')
      await switchTo(repo, 'feature')
      await makeCommit(repo, {
        entries: [{ path: 'feature.txt', contents: 'feature' }],
        commitMessage: 'feature commit',
      })
      const featureSHA = await getSHA(repo)

      await switchTo(repo, 'master')
      const mainSHA = await getSHA(repo)

      let callbackCalled = false
      const disposable = store.getAheadBehind(repo, mainSHA, featureSHA, () => {
        callbackCalled = true
      })

      // Immediately dispose — should prevent callback
      disposable.dispose()

      // Confirm the underlying worker completed and cached its result.
      await waitForAheadBehind(store, repo, mainSHA, featureSHA)

      assert.equal(callbackCalled, false)
    })
  })
})
