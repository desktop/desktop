import { expect, use as chaiUse } from 'chai'
import { setupEmptyRepository, setupFixtureRepository } from '../../fixture-helper'
import { Repository } from '../../../src/models/repository'
import { checkoutBranch, getTip } from '../../../src/lib/git'
import { TipState, IValidBranch } from '../../../src/models/tip'

chaiUse(require('chai-datetime'))

describe('git/checkout', () => {
  it('throws when invalid characters are used for branch name', async () => {
    const repository = await setupEmptyRepository()

    let errorRaised = false
    try {
      await checkoutBranch(repository, '..')
    } catch (error) {
      errorRaised = true
      expect(error.message).to.equal('The provided name \'..\' is not a valid ref.')
    }

    expect(errorRaised).to.be.true
  })

  it('can checkout a valid branch name in an existing repository', async () => {
    const path = await setupFixtureRepository('repo-with-many-refs')
    const repository = new Repository(path, -1, null, false)

    await checkoutBranch(repository, 'commit-with-long-description')

    const tip = await getTip(repository)
    expect(tip.kind).to.equal(TipState.Valid)

    const validBranch = tip as IValidBranch
    expect(validBranch.branch.name).to.equal('commit-with-long-description')
  })
})
