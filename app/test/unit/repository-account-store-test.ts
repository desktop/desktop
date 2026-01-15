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

  /**
   * Multi-Account Switching Tests
   * 
   * These tests verify that when switching between accounts for a repository,
   * the correct username, email, and other account details are properly
   * associated with the repository.
   */
  describe('account switching with user identity validation', () => {
    /**
     * Helper to create test accounts with distinct, traceable identities.
     * Each account has unique login, email, name, and id to verify correct
     * account selection after switching.
     */
    function createAccountWithEmail(
      login: string,
      email: string,
      name: string,
      id: number
    ): Account {
      const emails: ReadonlyArray<IAPIEmail> = [
        { email, primary: true, verified: true, visibility: 'public' }
      ]
      return new Account(
        login,
        'https://api.github.com',
        `token-${login}`,
        emails,
        `https://avatars.githubusercontent.com/${login}`,
        id,
        name,
        'free'
      )
    }

    it('correctly updates preferred account login when switching accounts', () => {
      // Create two distinct accounts
      const personalAccount = createAccountWithEmail(
        'personal-user',
        'personal@gmail.com',
        'Personal Name',
        1001
      )
      const workAccount = createAccountWithEmail(
        'work-user',
        'work@company.com',
        'Work Name',
        1002
      )

      // Set personal account as preferred
      store.setPreferredAccount(repository, personalAccount)
      assert.strictEqual(
        store.getPreferredAccountLogin(repository),
        'personal-user',
        'Should have personal account login'
      )

      // Switch to work account
      store.setPreferredAccount(repository, workAccount)
      assert.strictEqual(
        store.getPreferredAccountLogin(repository),
        'work-user',
        'Should have work account login after switch'
      )

      // Switch back to personal
      store.setPreferredAccount(repository, personalAccount)
      assert.strictEqual(
        store.getPreferredAccountLogin(repository),
        'personal-user',
        'Should revert to personal account login'
      )
    })

    it('preserves account preference for different repositories independently', () => {
      // Create two repositories
      const owner = new Owner('test', 'https://api.github.com', 1, undefined)
      const gitHubRepo1 = new GitHubRepository(
        'repo-1', owner, 201, false,
        'https://github.com/test/repo-1',
        'https://github.com/test/repo-1.git',
        true, false
      )
      const gitHubRepo2 = new GitHubRepository(
        'repo-2', owner, 202, false,
        'https://github.com/test/repo-2',
        'https://github.com/test/repo-2.git',
        true, false
      )
      const repo1 = new Repository('D:\\test\\repo-1', 201, gitHubRepo1, false)
      const repo2 = new Repository('D:\\test\\repo-2', 202, gitHubRepo2, false)

      // Create two accounts
      const personalAccount = createAccountWithEmail(
        'personal-user', 'personal@gmail.com', 'Personal', 1001
      )
      const workAccount = createAccountWithEmail(
        'work-user', 'work@company.com', 'Work', 1002
      )

      // Set different accounts for different repos
      store.setPreferredAccount(repo1, personalAccount)
      store.setPreferredAccount(repo2, workAccount)

      // Verify each repo has its own preference
      assert.strictEqual(
        store.getPreferredAccountLogin(repo1),
        'personal-user',
        'Repo 1 should use personal account'
      )
      assert.strictEqual(
        store.getPreferredAccountLogin(repo2),
        'work-user',
        'Repo 2 should use work account'
      )

      // Switching one repo should not affect the other
      store.setPreferredAccount(repo1, workAccount)
      assert.strictEqual(
        store.getPreferredAccountLogin(repo1),
        'work-user',
        'Repo 1 should now use work account'
      )
      assert.strictEqual(
        store.getPreferredAccountLogin(repo2),
        'work-user',
        'Repo 2 should still use work account (unchanged)'
      )
    })

    it('handles switching between accounts with similar logins but different ids', () => {
      // Edge case: accounts that might look similar but are different
      const account1 = createAccountWithEmail(
        'dev-user', 'dev@personal.com', 'Dev Personal', 3001
      )
      const account2 = createAccountWithEmail(
        'dev-user-work', 'dev@work.com', 'Dev Work', 3002
      )

      store.setPreferredAccount(repository, account1)
      assert.strictEqual(store.getPreferredAccountLogin(repository), 'dev-user')

      store.setPreferredAccount(repository, account2)
      assert.strictEqual(store.getPreferredAccountLogin(repository), 'dev-user-work')
    })
  })

  describe('account lookup after switching', () => {
    /**
     * These tests verify that after setting a preferred account,
     * the correct account can be looked up from a list of accounts
     * using the stored login.
     */
    it('can find the correct account from accounts list using stored login', () => {
      const accounts = [
        new Account('alice', 'https://api.github.com', 'token-a',
          [{ email: 'alice@example.com', primary: true, verified: true, visibility: 'public' }],
          '', 4001, 'Alice Smith', 'free'),
        new Account('bob', 'https://api.github.com', 'token-b',
          [{ email: 'bob@example.com', primary: true, verified: true, visibility: 'public' }],
          '', 4002, 'Bob Jones', 'pro'),
        new Account('charlie', 'https://api.github.com', 'token-c',
          [{ email: 'charlie@example.com', primary: true, verified: true, visibility: 'public' }],
          '', 4003, 'Charlie Brown', 'free'),
      ]

      // Set Bob as preferred
      store.setPreferredAccount(repository, accounts[1])
      const preferredLogin = store.getPreferredAccountLogin(repository)
      
      // Find the account from the list
      const foundAccount = accounts.find(a => a.login === preferredLogin)
      
      assert.ok(foundAccount, 'Should find the preferred account')
      assert.strictEqual(foundAccount.login, 'bob')
      assert.strictEqual(foundAccount.emails[0].email, 'bob@example.com')
      assert.strictEqual(foundAccount.name, 'Bob Jones')
      assert.strictEqual(foundAccount.id, 4002)
    })

    it('validates email is correct for found account after switch', () => {
      const personalAccount = new Account(
        'personal', 'https://api.github.com', 'token-p',
        [
          { email: 'personal@gmail.com', primary: true, verified: true, visibility: 'public' },
          { email: 'personal-alt@gmail.com', primary: false, verified: true, visibility: 'public' }
        ],
        '', 5001, 'Personal User', 'free'
      )
      const workAccount = new Account(
        'work', 'https://api.github.com', 'token-w',
        [
          { email: 'work@company.com', primary: true, verified: true, visibility: 'private' }
        ],
        '', 5002, 'Work User', 'pro'
      )

      const accounts = [personalAccount, workAccount]

      // Switch to work account and verify email
      store.setPreferredAccount(repository, workAccount)
      let preferredLogin = store.getPreferredAccountLogin(repository)
      let foundAccount = accounts.find(a => a.login === preferredLogin)
      
      assert.ok(foundAccount)
      assert.strictEqual(foundAccount.emails[0].email, 'work@company.com',
        'Work account should have work email')

      // Switch to personal account and verify email changes
      store.setPreferredAccount(repository, personalAccount)
      preferredLogin = store.getPreferredAccountLogin(repository)
      foundAccount = accounts.find(a => a.login === preferredLogin)
      
      assert.ok(foundAccount)
      assert.strictEqual(foundAccount.emails[0].email, 'personal@gmail.com',
        'Personal account should have personal email')
    })

    it('validates name is correct for found account after switch', () => {
      const accounts = [
        new Account('user-a', 'https://api.github.com', 'token',
          [{ email: 'a@test.com', primary: true, verified: true, visibility: 'public' }],
          '', 6001, 'Alice Anderson', 'free'),
        new Account('user-b', 'https://api.github.com', 'token',
          [{ email: 'b@test.com', primary: true, verified: true, visibility: 'public' }],
          '', 6002, 'Bob Builder', 'free'),
      ]

      // Set first account
      store.setPreferredAccount(repository, accounts[0])
      let login = store.getPreferredAccountLogin(repository)
      let found = accounts.find(a => a.login === login)
      assert.strictEqual(found?.name, 'Alice Anderson')

      // Switch to second account
      store.setPreferredAccount(repository, accounts[1])
      login = store.getPreferredAccountLogin(repository)
      found = accounts.find(a => a.login === login)
      assert.strictEqual(found?.name, 'Bob Builder')
    })
  })
})
