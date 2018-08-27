import { expect } from 'chai'

import { Account } from '../../src/models/account'
import { findAccountForRemoteURL } from '../../src/lib/find-account'
import { getDotComAPIEndpoint, getEnterpriseAPIURL } from '../../src/lib/api'

// these tests are running against the real GitHub API and are rate-limited
// to 60 requests per hour on an IP address - disabling these for now until
// we can get proper unit tests in place
describe.skip('findAccountForRemoteURL', () => {
  const accounts: ReadonlyArray<Account> = [
    new Account(
      'joan',
      getDotComAPIEndpoint(),
      'deadbeef',
      [],
      '',
      1,
      'GitHub'
    ),
    new Account(
      'joel',
      getEnterpriseAPIURL('https://github.mycompany.com'),
      'deadbeef',
      [],
      '',
      2,
      'My Company'
    ),
  ]

  // this test currently fails due to the details outlined in https://github.com/desktop/desktop/issues/4154
  it.skip('gives no account for non-GitHub endpoint', async () => {
    const account = await findAccountForRemoteURL(
      'https://gitlab.com/inkscape/inkscape.git',
      accounts
    )
    expect(account).to.equal(null)
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

  it('finds the account for GitHub owner/name repository', async () => {
    const account = await findAccountForRemoteURL('inkscape/inkscape', accounts)
    expect(account).not.to.equal(null)
    expect(account!.login).to.equal('joan')
  })

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
