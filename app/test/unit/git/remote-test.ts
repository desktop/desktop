import { expect } from 'chai'

import { Repository } from '../../../src/models/repository'
import { getRemotes, getDefaultRemote, addRemote } from '../../../src/lib/git/remote'
import { setupFixtureRepository, setupEmptyRepository } from '../../fixture-helper'

const temp = require('temp').track()

describe('git/remote', () => {

  after(() => {
    temp.cleanupSync()
  })

  describe('getRemotes', () => {
    it('should return both remotes', async () => {
      const testRepoPath = setupFixtureRepository('repo-with-multiple-remotes')
      const repository = new Repository(testRepoPath, -1, null)

      const result = await getRemotes(repository)

      expect(result).to.contain('origin')
      expect(result).to.contain('bassoon')
    })
  })

  describe('getDefaultRemote', () => {
    it('returns origin when multiple remotes found', async () => {
      const testRepoPath = setupFixtureRepository('repo-with-multiple-remotes')
      const repository = new Repository(testRepoPath, -1, null)

      const result = await getDefaultRemote(repository)

      expect(result).to.equal('origin')
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
      await addRemote(repository, 'origin', 'https://github.com/desktop/desktop')

      const result = await getDefaultRemote(repository)

      expect(result).to.equal('origin')
    })
  })
})
