import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Account } from '../../src/models/account'
import { findAccountForRemoteURL } from '../../src/lib/find-account'
import { getDotComAPIEndpoint, getEnterpriseAPIURL } from '../../src/lib/api'

describe('findAccountForRemoteURL', () => {
  const mockCanAccessRepository = (
    account: Account,
    owner: string,
    name: string
  ) => {
    // private repository, only this person can access it
    if (
      account.endpoint === getDotComAPIEndpoint() &&
      account.login === 'joan' &&
      owner === 'desktop' &&
      name === 'repo-fixture'
    ) {
      return Promise.resolve(true)
    }

    // public repository is accessible to everyone
    if (
      account.endpoint === getDotComAPIEndpoint() &&
      owner === 'inkscape' &&
      name === 'inkscape'
    ) {
      return Promise.resolve(true)
    }

    return Promise.resolve(false)
  }

  const accounts: ReadonlyArray<Account> = [
    new Account(
      'joan',
      getDotComAPIEndpoint(),
      'deadbeef',
      [],
      '',
      1,
      'GitHub',
      'free'
    ),
    new Account(
      'joel',
      getEnterpriseAPIURL('https://github.mycompany.com'),
      'deadbeef',
      [],
      '',
      2,
      'My Company',
      'free'
    ),
  ]

  it('gives no account for non-GitHub endpoint', async () => {
    const account = await findAccountForRemoteURL(
      'https://gitlab.com/inkscape/inkscape.git',
      accounts,
      mockCanAccessRepository
    )
    assert(account === null)
  })

  it('gives no account for non-existent GitHub owner/name repository', async () => {
    const account = await findAccountForRemoteURL(
      'desktop/nonexistent-repo-fixture',
      accounts,
      mockCanAccessRepository
    )
    assert(account === null)
  })

  it('finds the anonymous account for public GitHub owner/name repository', async () => {
    const account = await findAccountForRemoteURL(
      'inkscape/inkscape',
      [],
      mockCanAccessRepository
    )
    assert(account !== null)
    assert.deepStrictEqual(account, Account.anonymous())
  })

  it('finds the anonymous account for public repository on GitHub endpoint', async () => {
    const account = await findAccountForRemoteURL(
      'https://github.com/inkscape/inkscape',
      [],
      mockCanAccessRepository
    )
    assert(account !== null)
    assert.deepStrictEqual(account, Account.anonymous())
  })

  it('finds the account for GitHub owner/name repository', async () => {
    const account = await findAccountForRemoteURL(
      'inkscape/inkscape',
      accounts,
      mockCanAccessRepository
    )
    assert(account !== null)
    assert.deepStrictEqual(account.login, 'joan')
  })

  it('finds the account for GitHub endpoint', async () => {
    const account = await findAccountForRemoteURL(
      'https://github.com/inkscape/inkscape.git',
      accounts,
      mockCanAccessRepository
    )
    assert(account !== null)
    assert.deepStrictEqual(account.login, 'joan')
  })

  it('finds the account for GitHub Enterprise endpoint', async () => {
    const account = await findAccountForRemoteURL(
      'https://github.mycompany.com/inkscape/inkscape.git',
      accounts,
      mockCanAccessRepository
    )
    assert(account !== null)
    assert.deepStrictEqual(account.login, 'joel')
  })

  it('finds the account for private GitHub owner/name repository', async () => {
    const account = await findAccountForRemoteURL(
      'desktop/repo-fixture',
      accounts,
      mockCanAccessRepository
    )
    assert(account !== null)
    assert.deepStrictEqual(account.login, 'joan')
  })

  it('cannot see the private GitHub owner/name repository', async () => {
    const account = await findAccountForRemoteURL(
      'desktop/repo-fixture',
      [],
      mockCanAccessRepository
    )
    assert(account === null)
  })
})
