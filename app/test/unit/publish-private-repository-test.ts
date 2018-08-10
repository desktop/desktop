import { expect } from 'chai'

import { IAPIUserWithPlan } from '../../src/lib/api'
import { Account } from '../../src/models/account'
import { canCreatePrivateRepo } from '../../src/ui/publish-repository/publish-private-repository-checker'

describe('can publish private repository', () => {
  it('return true when user on developer plan', () => {
    const account = new Account(
      'damaneice',
      'https://api.github.com',
      '',
      [],
      '',
      1,
      '',
      { name: 'developer' }
    )

    expect(canCreatePrivateRepo(account)).to.be.true
  })

  it('return false when user on free plan', () => {
    const account = new Account(
      'damaneice',
      'https://api.github.com',
      '',
      [],
      '',
      1,
      '',
      { name: 'free' }
    )

    expect(canCreatePrivateRepo(account)).to.be.false
  })

  it('return false when user plan is missing', () => {
    const account = new Account(
      'damaneice',
      'https://api.github.com',
      '',
      [],
      '',
      1,
      ''
    )

    expect(canCreatePrivateRepo(account)).to.be.false
  })

  it('return false when org is on free plan', () => {
    const account = new Account(
      'damaneice',
      'https://api.github.com',
      '',
      [],
      '',
      1,
      '',
      { name: 'developer' }
    )
    const org = {
      desktop: {
        plan: {
          name: 'free',
        },
        type: 'Organization',
      } as IAPIUserWithPlan,
    }

    expect(canCreatePrivateRepo(account, org.desktop)).to.be.false
  })

  it('return false when org is on team plan and cannot create repositories', () => {
    const account = new Account(
      'damaneice',
      'https://api.github.com',
      '',
      [],
      '',
      1,
      '',
      { name: 'developer' }
    )
    const org = {
      desktop: {
        plan: {
          name: 'team',
        },
        type: 'Organization',
      } as IAPIUserWithPlan,
    }

    expect(canCreatePrivateRepo(account, org.desktop)).to.be.false
  })

  it('return false when the org plan is missing', () => {
    const account = new Account(
      'damaneice',
      'https://api.github.com',
      '',
      [],
      '',
      1,
      '',
      { name: 'developer' }
    )
    const org = {
      desktop: {
        type: 'Organization',
      } as IAPIUserWithPlan,
    }

    expect(canCreatePrivateRepo(account, org.desktop)).to.be.false
  })

  it('return true when org is on team plan and can create repositories', () => {
    const account = new Account(
      'damaneice',
      'https://api.github.com',
      '',
      [],
      '',
      1,
      '',
      { name: 'developer' }
    )
    const org = {
      desktop: {
        plan: {
          name: 'team',
        },
        members_can_create_repositories: true,
        type: 'Organization',
      } as IAPIUserWithPlan,
    }

    expect(canCreatePrivateRepo(account, org.desktop)).to.be.true
  })
})
