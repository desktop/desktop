import { expect } from 'chai'

import { Account } from '../../src/models/account'
import { findAccountForRemoteURL } from '../../src/lib/find-account'
import { getDotComAPIEndpoint, getEnterpriseAPIURL } from '../../src/lib/api'

describe('findAccountForRemoteURL', () => {
  let accounts: ReadonlyArray<Account> = []
  before(() => {
    const newAccounts = [
      {
        login: 'joan',
        endpoint: getDotComAPIEndpoint(),
        name: 'GitHub',
      },
      {
        login: 'joel',
        endpoint: getEnterpriseAPIURL('https://github.mycompany.com'),
        name: 'My Company',
      },
    ]

    newAccounts.forEach(newAccount => {
      const { login, endpoint, name } = newAccount
      const account = new Account(login, endpoint, 'deadbeef', [], '', 1, name)
      accounts = [...accounts, account]
    })
  })

  it('gives no account for non-GitHub endpoint', async () => {
    const account = await findAccountForRemoteURL(
      'https://gitlab.com/inkscape/inkscape.git',
      accounts
    )
    expect(account).equal(null)
  })

  it('gives no account for non-existent GitHub owner/name repository', async () => {
    const account = await findAccountForRemoteURL(
      'desktop/nonexistent-repo-fixture',
      accounts
    )
    expect(account).to.equal(null)
  })

  it('finds the anonymous account for public GitHub owner/name repository', async () => {
    const account = await findAccountForRemoteURL('inkscape/inkscape', [])
    expect(account).not.to.equal(null)
    expect(account!).to.eql(Account.anonymous())
  })

  it('finds the anonymous account for public repository on GitHub endpoint', async () => {
    const account = await findAccountForRemoteURL(
      'https://github.com/inkscape/inkscape',
      []
    )
    expect(account).not.to.equal(null)
    expect(account!).to.eql(Account.anonymous())
  })

  // TODO check authenticated account is used
  /* it('finds the account for GitHub owner/name repository', async () => {
    const account = await findAccountForRemoteURL('desktop/repo-fixture', accounts)
    expect(account).not.to.equal(null)
    expect(account!.login).to.equal('joan')
  }) */

  it('finds the account for GitHub endpoint', async () => {
    const account = await findAccountForRemoteURL(
      'https://github.com/inkscape/inkscape.git',
      accounts
    )
    expect(account).not.to.equal(null)
    expect(account!.login).to.equal('joan')
  })

  it('finds the account for GitHub Enterprise endpoint', async () => {
    const account = await findAccountForRemoteURL(
      'https://github.mycompany.com/inkscape/inkscape.git',
      accounts
    )
    expect(account).not.to.equal(null)
    expect(account!.login).to.equal('joel')
  })
})
