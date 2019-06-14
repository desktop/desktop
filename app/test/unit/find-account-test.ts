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

  it('gives no account for non-GitHub endpoint', async () => {
    const account = await findAccountForRemoteURL(
      'https://gitlab.com/inkscape/inkscape.git',
      accounts,
      mockCanAccessRepository
    )
    expect(account).toBeNull()
  })

  it('gives no account for non-existent GitHub owner/name repository', async () => {
    const account = await findAccountForRemoteURL(
      'desktop/nonexistent-repo-fixture',
      accounts,
      mockCanAccessRepository
    )
    expect(account).toBeNull()
  })

  it('finds the anonymous account for public GitHub owner/name repository', async () => {
    const account = await findAccountForRemoteURL(
      'inkscape/inkscape',
      [],
      mockCanAccessRepository
    )
    expect(account).not.toBeNull()
    expect(account!).toEqual(Account.anonymous())
  })

  it('finds the anonymous account for public repository on GitHub endpoint', async () => {
    const account = await findAccountForRemoteURL(
      'https://github.com/inkscape/inkscape',
      [],
      mockCanAccessRepository
    )
    expect(account).not.toBeNull()
    expect(account!).toEqual(Account.anonymous())
  })

  it('finds the account for GitHub owner/name repository', async () => {
    const account = await findAccountForRemoteURL(
      'inkscape/inkscape',
      accounts,
      mockCanAccessRepository
    )
    expect(account).not.toBeNull()
    expect(account!.login).toBe('joan')
  })

  it('finds the account for GitHub endpoint', async () => {
    const account = await findAccountForRemoteURL(
      'https://github.com/inkscape/inkscape.git',
      accounts,
      mockCanAccessRepository
    )
    expect(account).not.toBeNull()
    expect(account!.login).toBe('joan')
  })

  it('finds the account for GitHub Enterprise endpoint', async () => {
    const account = await findAccountForRemoteURL(
      'https://github.mycompany.com/inkscape/inkscape.git',
      accounts,
      mockCanAccessRepository
    )
    expect(account).not.toBeNull()
    expect(account!.login).toBe('joel')
  })

  it('finds the account for private GitHub owner/name repository', async () => {
    const account = await findAccountForRemoteURL(
      'desktop/repo-fixture',
      accounts,
      mockCanAccessRepository
    )
    expect(account).not.toBeNull()
    expect(account!.login).toBe('joan')
  })

  it('cannot see the private GitHub owner/name repository', async () => {
    const account = await findAccountForRemoteURL(
      'desktop/repo-fixture',
      [],
      mockCanAccessRepository
    )
    expect(account).toBeNull()
  })
})
