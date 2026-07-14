import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Repository } from '../../../src/models/repository'
import {
  getRemotes,
  addRemote,
  removeRemote,
  setRemoteURL,
} from '../../../src/lib/git/remote'
import {
  setupFixtureRepository,
  setupEmptyRepository,
  setupEmptyDirectory,
} from '../../helpers/repositories'
import { findDefaultRemote } from '../../../src/lib/stores/helpers/find-default-remote'
import { exec } from 'dugite'
import { setConfigValue } from '../../../src/lib/git'

describe('git/remote', () => {
  describe('getRemotes', () => {
    it('should return both remotes', async t => {
      const testRepoPath = await setupFixtureRepository(
        t,
        'repo-with-multiple-remotes'
      )
      const repository = new Repository(testRepoPath, -1, null, false)
      await addRemote(repository, 'spaces-in-path', '/path/with spaces/foo')

      // NB: We don't check for exact URL equality because CircleCI's git config
      // rewrites HTTPS URLs to SSH.
      const nwo = 'shiftkey/friendly-bassoon.git'

      const result = await getRemotes(repository)

      // Changes the output of git remote -v, see
      // https://github.com/git/git/blob/9005149a4a77e2d3409c6127bf4fd1a0893c3495/builtin/remote.c#L1223-L1226
      await setConfigValue(
        repository,
        'remote.bassoon.partialclonefilter',
        'foo'
      )

      assert.equal(result[0].name, 'bassoon')
      assert(result[0].url.endsWith(nwo))

      assert.equal(result[1].name, 'origin')
      assert(result[1].url.endsWith(nwo))

      assert.equal(result[2].name, 'spaces-in-path')
      assert.equal(result[2].url, '/path/with spaces/foo')
    })

    it('returns remotes sorted alphabetically', async t => {
      const repository = await setupEmptyRepository(t)

      // adding these remotes out-of-order to test how they are then retrieved
      const url = 'https://github.com/desktop/not-found.git'

      await exec(['remote', 'add', 'X', url], repository.path)
      await exec(['remote', 'add', 'A', url], repository.path)
      await exec(['remote', 'add', 'L', url], repository.path)
      await exec(['remote', 'add', 'T', url], repository.path)
      await exec(['remote', 'add', 'D', url], repository.path)

      const result = await getRemotes(repository)
      assert.equal(result.length, 5)

      assert.equal(result[0].name, 'A')
      assert.equal(result[1].name, 'D')
      assert.equal(result[2].name, 'L')
      assert.equal(result[3].name, 'T')
      assert.equal(result[4].name, 'X')
    })

    it('returns empty array for directory without a .git directory', async t => {
      const repository = await setupEmptyDirectory(t)
      const remotes = await getRemotes(repository)
      assert.equal(remotes.length, 0)
    })

    it('returns promisor remote', async t => {
      const repository = await setupEmptyRepository(t)

      // Add a remote
      const url = 'https://github.com/desktop/not-found.git'
      await exec(['remote', 'add', 'hasBlobFilter', url], repository.path)

      // Fetch a remote and add a filter
      await exec(['fetch', '--filter=blob:none'], repository.path)

      // Shows that the new remote does have a filter
      const rawGetRemote = await exec(['remote', '-v'], repository.path)
      const needle = url + ' (fetch) [blob:none]'
      assert(rawGetRemote.stdout.includes(needle))

      // Shows that the `getRemote` returns that remote
      const result = await getRemotes(repository)
      assert.equal(result.length, 1)
      assert.equal(result[0].name, 'hasBlobFilter')
    })
  })

  describe('findDefaultRemote', () => {
    it('returns null for empty array', async () => {
      const result = await findDefaultRemote([])
      assert(result === null)
    })

    it('returns origin when multiple remotes found', async t => {
      const testRepoPath = await setupFixtureRepository(
        t,
        'repo-with-multiple-remotes'
      )
      const repository = new Repository(testRepoPath, -1, null, false)

      const remotes = await getRemotes(repository)
      const result = await findDefaultRemote(remotes)

      assert(result !== null)
      assert.equal(result.name, 'origin')
    })

    it('returns something when origin removed', async t => {
      const testRepoPath = await setupFixtureRepository(
        t,
        'repo-with-multiple-remotes'
      )
      const repository = new Repository(testRepoPath, -1, null, false)
      await removeRemote(repository, 'origin')

      const remotes = await getRemotes(repository)
      const result = await findDefaultRemote(remotes)

      assert(result !== null)
      assert.equal(result.name, 'bassoon')
    })

    it('returns null for new repository', async t => {
      const repository = await setupEmptyRepository(t)

      const remotes = await getRemotes(repository)
      const result = await findDefaultRemote(remotes)

      assert(result === null)
    })
  })

  describe('addRemote', () => {
    it('can set origin and return it as default', async t => {
      const repository = await setupEmptyRepository(t)
      await addRemote(
        repository,
        'origin',
        'https://github.com/desktop/desktop'
      )

      const remotes = await getRemotes(repository)
      const result = await findDefaultRemote(remotes)

      assert(result !== null)
      assert.equal(result.name, 'origin')
    })
  })

  describe('removeRemote', () => {
    it('silently fails when remote not defined', async t => {
      const repository = await setupEmptyRepository(t)
      await assert.doesNotReject(removeRemote(repository, 'origin'))
    })
  })

  describe('setRemoteURL', () => {
    const remoteName = 'origin'
    const remoteUrl = 'https://fakeweb.com/owner/name'
    const newUrl = 'https://github.com/desktop/desktop'

    it('can set the url for an existing remote', async t => {
      const repository = await setupEmptyRepository(t)
      await addRemote(repository, remoteName, remoteUrl)
      assert.equal(await setRemoteURL(repository, remoteName, newUrl), true)

      const remotes = await getRemotes(repository)
      assert.equal(remotes.length, 1)
      assert.equal(remotes[0].url, newUrl)
    })
    it('returns false for unknown remote name', async t => {
      const repository = await setupEmptyRepository(t)
      await addRemote(repository, remoteName, remoteUrl)
      await assert.rejects(() => setRemoteURL(repository, 'none', newUrl))

      const remotes = await getRemotes(repository)
      assert.equal(remotes.length, 1)
      assert.equal(remotes[0].url, remoteUrl)
    })
  })
})
