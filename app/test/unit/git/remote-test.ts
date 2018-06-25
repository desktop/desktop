import { expect } from 'chai'

import { Repository } from '../../../src/models/repository'
import {
  getRemotes,
  getDefaultRemote,
  addRemote,
  removeRemote,
} from '../../../src/lib/git/remote'
import {
  setupFixtureRepository,
  setupEmptyRepository,
} from '../../helpers/repositories'

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

      expect(result[0].name).to.equal('bassoon')
      expect(result[0].url.endsWith(nwo)).to.equal(true)

      expect(result[1].name).to.equal('origin')
      expect(result[1].url.endsWith(nwo)).to.equal(true)
    })
  })

  describe('getDefaultRemote', () => {
    it('returns origin when multiple remotes found', async () => {
      const testRepoPath = await setupFixtureRepository(
        'repo-with-multiple-remotes'
      )
      const repository = new Repository(testRepoPath, -1, null, false)

      const result = await getDefaultRemote(repository)

      expect(result!.name).to.equal('origin')
    })

    it('returns something when origin removed', async () => {
      const testRepoPath = await setupFixtureRepository(
        'repo-with-multiple-remotes'
      )
      const repository = new Repository(testRepoPath, -1, null, false)
      await removeRemote(repository, 'origin')

      const result = await getDefaultRemote(repository)

      expect(result!.name).to.equal('bassoon')
    })

    it('returns null for new repository', async () => {
      const repository = await setupEmptyRepository()

      const result = await getDefaultRemote(repository)

      expect(result).to.be.null
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

      const result = await getDefaultRemote(repository)

      expect(result!.name).to.equal('origin')
    })
  })

  describe('removeRemote', () => {
    it('silently fails when remote not defined', async () => {
      const repository = await setupEmptyRepository()
      await removeRemote(repository, 'origin')
    })
  })
})
