import { expect, use as chaiUse } from 'chai'
import { setupEmptyRepository } from '../../fixture-helper'
import { checkoutBranch } from '../../../src/lib/git'

chaiUse(require('chai-datetime'))

describe('git/chckout', () => {
  describe('tip', () => {
    it('returns unborn for new repository', async () => {
      const repository = await setupEmptyRepository()

      let errorRaised = false
      try {
        await checkoutBranch(repository, '<>')
      } catch (error) {
        errorRaised = true
        expect(error.message).to.equal('The provided name \'<>\' is not a valid ref.')
      }

      expect(errorRaised).to.be.true
    })
  })
})
