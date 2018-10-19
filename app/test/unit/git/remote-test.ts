import { Repository } from '../../../src/models/repository'
import {
  getRemotes,
  addRemote,
  removeRemote,
} from '../../../src/lib/git/remote'
import {
  setupFixtureRepository,
  setupEmptyRepository,
  setupEmptyDirectory,
} from '../../helpers/repositories'
import { findDefaultRemote } from '../../../src/lib/stores/helpers/find-default-remote'

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

    it('returns empty array for directory without a .git directory', async () => {
      const repository = setupEmptyDirectory()
      const remotes = await getRemotes(repository)
      expect(remotes).toHaveLength(0)
    })
  })

  describe('findDefaultRemote', () => {
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
})
