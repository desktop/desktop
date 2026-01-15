import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { RepositoryAccountStore } from '../../src/lib/stores/repository-account-store'
import { Repository } from '../../src/models/repository'
import { Account } from '../../src/models/account'
import { GitHubRepository } from '../../src/models/github-repository'
import { Owner } from '../../src/models/owner'
import { IAPIEmail } from '../../src/lib/api'

describe('RepositoryAccountStore', () => {
  let store: RepositoryAccountStore
  let repository: Repository
  let account: Account

  beforeEach(() => {
    localStorage.clear()
    store = new RepositoryAccountStore()

    const owner = new Owner('test', 'https://api.github.com', 1, undefined)
    const gitHubRepository = new GitHubRepository(
        'test-repo', 
        owner, 
        100, 
        false, 
        'https://github.com/test/test-repo', 
        'https://github.com/test/test-repo.git', 
        true, 
        false
    )
    repository = new Repository('D:\\test\\repo', 100, gitHubRepository, false)

    const emails: ReadonlyArray<IAPIEmail> = [{ email: 'email@example.com', primary: true, verified: true, visibility: 'public' }]
    account = new Account('test-user', 'https://api.github.com', 'token', emails, '', 1, '', 'free')
  })

  it('stores and retrieves preferred account', () => {
    store.setPreferredAccount(repository, account)
    assert.strictEqual(store.getPreferredAccountLogin(repository), 'test-user')
  })

  it('returns null if no preferred account set', () => {
    assert.strictEqual(store.getPreferredAccountLogin(repository), null)
  })

  it('persists preference across instances', () => {
      store.setPreferredAccount(repository, account)
      const newStore = new RepositoryAccountStore()
      assert.strictEqual(newStore.getPreferredAccountLogin(repository), 'test-user')
  })
})
