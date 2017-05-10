import { expect, use as chaiUse } from 'chai'
import { setupEmptyRepository, setupFixtureRepository } from '../../fixture-helper'
import { Repository } from '../../../src/models/repository'
import { checkoutBranch } from '../../../src/lib/git'
import { TipState, IValidBranch } from '../../../src/models/tip'
import { GitStore } from '../../../src/lib/dispatcher/git-store'
import { shell } from '../../test-app-shell'

chaiUse(require('chai-datetime'))

describe('git/checkout', () => {
  it('throws when invalid characters are used for branch name', async () => {
    const repository = await setupEmptyRepository()

    let errorRaised = false
    try {
      await checkoutBranch(repository, '..')
    } catch (error) {
      errorRaised = true
      expect(error.message).to.equal('fatal: invalid reference: ..\n')
    }

    expect(errorRaised).to.be.true
  })

  it('can checkout a valid branch name in an existing repository', async () => {
    const path = await setupFixtureRepository('repo-with-many-refs')
    const repository = new Repository(path, -1, null, false)

    await checkoutBranch(repository, 'commit-with-long-description')

    const store = new GitStore(repository, shell)
    await store.loadStatus()
    const tip = store.tip


    expect(tip.kind).to.equal(TipState.Valid)

    const validBranch = tip as IValidBranch
    expect(validBranch.branch.name).to.equal('commit-with-long-description')
  })
})
