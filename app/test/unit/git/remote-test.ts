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

describe('git/remote', () => {
  describe('getRemotes', () => {
    it('should return both remotes', async () => {
      const testRepoPath = await setupFixtureRepository(
        'repo-with-multiple-remotes'
      )
      const repository = new Repository(testRepoPath, -1, null, false)

      // NB: We don't check for exact URL equality because CircleCI's git config
      // rewrites HTTPS URLs to SSH.
      const nwo = 'shiftkey/friendly-bassoon.git'

      const result = await getRemotes(repository)

      expect(result[0].name).toEqual('bassoon')
      expect(result[0].url.endsWith(nwo)).toEqual(true)

      expect(result[1].name).toEqual('origin')
      expect(result[1].url.endsWith(nwo)).toEqual(true)
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
