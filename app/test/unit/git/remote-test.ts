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
import { GitProcess } from 'dugite'
import { setConfigValue } from '../../../src/lib/git'

describe('git/remote', () => {
  describe('getRemotes', () => {
    it('should return both remotes', async () => {
      const testRepoPath = await setupFixtureRepository(
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
      setConfigValue(repository, 'remote.bassoon.partialclonefilter', 'foo')

      expect(result[0].name).toEqual('bassoon')
      expect(result[0].url.endsWith(nwo)).toEqual(true)

      expect(result[1].name).toEqual('origin')
      expect(result[1].url.endsWith(nwo)).toEqual(true)

      expect(result[2].name).toEqual('spaces-in-path')
      expect(result[2].url).toEqual('/path/with spaces/foo')
    })

    it('returns remotes sorted alphabetically', async () => {
      const repository = await setupEmptyRepository()

      // adding these remotes out-of-order to test how they are then retrieved
      const url = 'https://github.com/desktop/not-found.git'

      await GitProcess.exec(['remote', 'add', 'X', url], repository.path)
      await GitProcess.exec(['remote', 'add', 'A', url], repository.path)
      await GitProcess.exec(['remote', 'add', 'L', url], repository.path)
      await GitProcess.exec(['remote', 'add', 'T', url], repository.path)
      await GitProcess.exec(['remote', 'add', 'D', url], repository.path)

      const result = await getRemotes(repository)
      expect(result).toHaveLength(5)

      expect(result[0].name).toEqual('A')
      expect(result[1].name).toEqual('D')
      expect(result[2].name).toEqual('L')
      expect(result[3].name).toEqual('T')
      expect(result[4].name).toEqual('X')
    })

    it('returns empty array for directory without a .git directory', async () => {
      const repository = setupEmptyDirectory()
      const remotes = await getRemotes(repository)
      expect(remotes).toHaveLength(0)
    })

    it('returns promisor remote', async () => {
      const repository = await setupEmptyRepository()

      // Add a remote
      const url = 'https://github.com/desktop/not-found.git'
      await GitProcess.exec(
        ['remote', 'add', 'hasBlobFilter', url],
        repository.path
      )

      // Fetch a remote and add a filter
      await GitProcess.exec(['fetch', '--filter=blob:none'], repository.path)

      // Shows that the new remote does have a filter
      const rawGetRemote = await GitProcess.exec(
        ['remote', '-v'],
        repository.path
      )
      expect(rawGetRemote.stdout).toContain(url + ' (fetch) [blob:none]')

      // Shows that the `getRemote` returns that remote
      const result = await getRemotes(repository)
      expect(result).toHaveLength(1)
      expect(result[0].name).toEqual('hasBlobFilter')
    })
  })

  describe('findDefaultRemote', () => {
    it('returns null for empty array', async () => {
      const result = await findDefaultRemote([])
      expect(result).toBeNull()
    })

    it('returns origin when multiple remotes found', async () => {
      const testRepoPath = await setupFixtureRepository(
        'repo-with-multiple-remotes'
      )
      const repository = new Repository(testRepoPath, -1, null, false)

      const remotes = await getRemotes(repository)
      const result = await findDefaultRemote(remotes)

      expect(result!.name).toEqual('origin')
    })

    it('returns something when origin removed', async () => {
      const testRepoPath = await setupFixtureRepository(
        'repo-with-multiple-remotes'
      )
      const repository = new Repository(testRepoPath, -1, null, false)
      await removeRemote(repository, 'origin')

      const remotes = await getRemotes(repository)
      const result = await findDefaultRemote(remotes)

      expect(result!.name).toEqual('bassoon')
    })

    it('returns null for new repository', async () => {
      const repository = await setupEmptyRepository()

      const remotes = await getRemotes(repository)
      const result = await findDefaultRemote(remotes)

      expect(result).toBeNull()
    })
  })

  describe('addRemote', () => {
    it('can set origin and return it as default', async () => {
      const repository = await setupEmptyRepository()
      await addRemote(
        repository,
        'origin',
        'https://github.com/desktop/desktop'
      )

      const remotes = await getRemotes(repository)
      const result = await findDefaultRemote(remotes)

      expect(result!.name).toEqual('origin')
    })
  })

  describe('removeRemote', () => {
    it('silently fails when remote not defined', async () => {
      const repository = await setupEmptyRepository()
      expect(removeRemote(repository, 'origin')).resolves.not.toThrow()
    })
  })

  describe('setRemoteURL', () => {
    let repository: Repository
    const remoteName = 'origin'
    const remoteUrl = 'https://fakeweb.com/owner/name'
    const newUrl = 'https://github.com/desktop/desktop'

    beforeEach(async () => {
      repository = await setupEmptyRepository()
      await addRemote(repository, remoteName, remoteUrl)
    })
    it('can set the url for an existing remote', async () => {
      expect(await setRemoteURL(repository, remoteName, newUrl)).toBeTrue()

      const remotes = await getRemotes(repository)
      expect(remotes).toHaveLength(1)
      expect(remotes[0].url).toEqual(newUrl)
    })
    it('returns false for unknown remote name', async () => {
      expect(setRemoteURL(repository, 'none', newUrl)).rejects.toThrow()

      const remotes = await getRemotes(repository)
      expect(remotes).toHaveLength(1)
      expect(remotes[0].url).toEqual(remoteUrl)
    })
  })
})
