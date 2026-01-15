import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { Account } from '../../src/models/account'
import { AccountsStore } from '../../src/lib/stores'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'

describe('AccountsStore', () => {
  let accountsStore: AccountsStore

  beforeEach(() => {
    accountsStore = new AccountsStore(
      new InMemoryStore(),
      new AsyncInMemoryStore()
    )
  })

  describe('adding a new user', () => {
    it('contains the added user', async () => {
      const newAccountLogin = 'joan'
      await accountsStore.addAccount(
        new Account(newAccountLogin, '', 'deadbeef', [], '', 1, '', 'free')
      )

      const users = await accountsStore.getAll()
      assert.equal(users[0].login, newAccountLogin)
    })
  })

  describe('loading persisted users', () => {
    it('migrates .ghe.com users still using /api/v3 to api. subdomain', async () => {
      const dataStore = new InMemoryStore()
      dataStore.setItem(
        'users',
        JSON.stringify([
          {
            login: 'joan',
            endpoint: 'https://whatever.ghe.com/api/v3',
            token: 'deadbeef',
            emails: [],
            avatarURL: '',
            id: 1,
            name: '',
            plan: 'free',
          },
        ])
      )
      accountsStore = new AccountsStore(dataStore, new AsyncInMemoryStore())

      const users = await accountsStore.getAll()
      assert.equal(users[0].login, 'joan')
      assert.equal(users[0].endpoint, 'https://api.whatever.ghe.com/')

      const persistedUsers = JSON.parse(dataStore.getItem('users'))
      assert.equal(persistedUsers[0].login, 'joan')
      assert.equal(persistedUsers[0].endpoint, 'https://api.whatever.ghe.com/')
    })

    it('does NOT migrate GHE users already using the api. subdomain', async () => {
      const dataStore = new InMemoryStore()
      dataStore.setItem(
        'users',
        JSON.stringify([
          {
            login: 'joan',
            endpoint: 'https://api.whatever.ghe.com/',
            token: 'deadbeef',
            emails: [],
            avatarURL: '',
            id: 1,
            name: '',
            plan: 'free',
          },
        ])
      )
      accountsStore = new AccountsStore(dataStore, new AsyncInMemoryStore())

      const users = await accountsStore.getAll()
      assert.equal(users[0].login, 'joan')
      assert.equal(users[0].endpoint, 'https://api.whatever.ghe.com/')

      const persistedUsers = JSON.parse(dataStore.getItem('users'))
      assert.equal(persistedUsers[0].login, 'joan')
      assert.equal(persistedUsers[0].endpoint, 'https://api.whatever.ghe.com/')
    })

    it('does NOT migrate GHES users still using /api/v3 to api. subdomain', async () => {
      const dataStore = new InMemoryStore()
      dataStore.setItem(
        'users',
        JSON.stringify([
          {
            login: 'joan',
            endpoint: 'https://my-company-repos.com/api/v3',
            token: 'deadbeef',
            emails: [],
            avatarURL: '',
            id: 1,
            name: '',
            plan: 'free',
          },
        ])
      )
      accountsStore = new AccountsStore(dataStore, new AsyncInMemoryStore())

      const users = await accountsStore.getAll()
      assert.equal(users[0].login, 'joan')
      assert.equal(users[0].endpoint, 'https://my-company-repos.com/api/v3')

      const persistedUsers = JSON.parse(dataStore.getItem('users'))
      assert.equal(persistedUsers[0].login, 'joan')
      assert.equal(
        persistedUsers[0].endpoint,
        'https://my-company-repos.com/api/v3'
      )
    })
  })

  /**
   * Multi-Account Support Tests
   *
   * These tests verify the ability to have multiple accounts signed in
   * simultaneously on the same endpoint (e.g., multiple GitHub.com accounts).
   * This is critical for users who need to work with both personal and
   * work accounts.
   */
  describe('multi-account support', () => {
    // GitHub.com API endpoint - used for testing multiple accounts on same endpoint
    const dotComEndpoint = 'https://api.github.com'

    /**
     * Helper function to create a test Account with sensible defaults.
     * This makes tests more readable by only requiring the essential
     * properties that differ between accounts.
     */
    function createTestAccount(
      login: string,
      id: number,
      endpoint: string = dotComEndpoint,
      token: string = `token-${login}`
    ): Account {
      return new Account(
        login,
        endpoint,
        token,
        [], // emails
        `https://avatars.githubusercontent.com/${login}`, // avatarURL
        id,
        login, // name (using login as name for simplicity)
        'free' // plan
      )
    }

    describe('adding multiple accounts on the same endpoint', () => {
      it('allows adding multiple GitHub.com accounts', async () => {
        // Add first account (personal)
        const personalAccount = createTestAccount('personal-user', 1001)
        await accountsStore.addAccount(personalAccount)

        // Add second account (work) on the same endpoint
        const workAccount = createTestAccount('work-user', 1002)
        await accountsStore.addAccount(workAccount)

        // Both accounts should be present
        const accounts = await accountsStore.getAll()
        assert.equal(accounts.length, 2, 'Should have 2 accounts')

        // Verify both accounts are correctly stored
        const logins = accounts.map(a => a.login)
        assert.ok(logins.includes('personal-user'), 'Should contain personal account')
        assert.ok(logins.includes('work-user'), 'Should contain work account')
      })

      it('preserves existing accounts when adding a new one', async () => {
        // Add first account
        const firstAccount = createTestAccount('first-user', 2001)
        await accountsStore.addAccount(firstAccount)

        // Verify first account exists
        let accounts = await accountsStore.getAll()
        assert.equal(accounts.length, 1)
        assert.equal(accounts[0].login, 'first-user')

        // Add second account
        const secondAccount = createTestAccount('second-user', 2002)
        await accountsStore.addAccount(secondAccount)

        // Both accounts should exist
        accounts = await accountsStore.getAll()
        assert.equal(accounts.length, 2, 'First account should not be replaced')
      })

      it('updates an existing account when adding with same id', async () => {
        // Add initial account
        const initialAccount = createTestAccount('user-v1', 3001)
        await accountsStore.addAccount(initialAccount)

        // Add updated account with same id but different login
        // (simulating account name change)
        const updatedAccount = createTestAccount('user-v2', 3001)
        await accountsStore.addAccount(updatedAccount)

        // Should only have one account (updated)
        const accounts = await accountsStore.getAll()
        assert.equal(accounts.length, 1, 'Should have replaced the account with same id')
        assert.equal(accounts[0].login, 'user-v2', 'Should have the updated login')
      })

      it('supports accounts from different endpoints alongside multiple same-endpoint accounts', async () => {
        // Add two GitHub.com accounts
        await accountsStore.addAccount(createTestAccount('dotcom-user-1', 4001))
        await accountsStore.addAccount(createTestAccount('dotcom-user-2', 4002))

        // Add a GitHub Enterprise account
        const gheEndpoint = 'https://github.mycompany.com/api/v3'
        await accountsStore.addAccount(createTestAccount('ghe-user', 4003, gheEndpoint))

        // All three accounts should be present
        const accounts = await accountsStore.getAll()
        assert.equal(accounts.length, 3, 'Should have all 3 accounts')

        // Verify endpoints
        const dotComAccounts = accounts.filter(a => a.endpoint === dotComEndpoint)
        const gheAccounts = accounts.filter(a => a.endpoint === gheEndpoint)
        assert.equal(dotComAccounts.length, 2, 'Should have 2 GitHub.com accounts')
        assert.equal(gheAccounts.length, 1, 'Should have 1 GHE account')
      })
    })

    describe('removing accounts', () => {
      it('removes only the specified account, leaving others intact', async () => {
        // Add multiple accounts
        const accountToKeep = createTestAccount('keep-me', 5001)
        const accountToRemove = createTestAccount('remove-me', 5002)
        await accountsStore.addAccount(accountToKeep)
        await accountsStore.addAccount(accountToRemove)

        // Remove one account
        await accountsStore.removeAccount(accountToRemove)

        // Only the kept account should remain
        const accounts = await accountsStore.getAll()
        assert.equal(accounts.length, 1, 'Should have 1 account remaining')
        assert.equal(accounts[0].login, 'keep-me', 'Wrong account was removed')
      })

      it('removes account with correct id even if multiple accounts have same login', async () => {
        // This tests an edge case where somehow two accounts have the same login
        // but different IDs (shouldn't happen in practice, but we should handle it)
        const account1 = createTestAccount('same-login', 6001)
        const account2 = new Account(
          'same-login',
          'https://github.othercompany.com/api/v3', // different endpoint
          'different-token',
          [],
          '',
          6002, // different id
          'Same Login',
          'free'
        )

        await accountsStore.addAccount(account1)
        await accountsStore.addAccount(account2)

        // Remove by endpoint and id match
        await accountsStore.removeAccount(account1)

        const accounts = await accountsStore.getAll()
        assert.equal(accounts.length, 1)
        assert.equal(accounts[0].id, 6002, 'Should have removed the correct account')
      })
    })

    describe('account token isolation', () => {
      it('stores unique tokens for each account', async () => {
        const secureStore = new AsyncInMemoryStore()
        const dataStore = new InMemoryStore()
        accountsStore = new AccountsStore(dataStore, secureStore)

        // Add two accounts with different tokens
        const account1 = createTestAccount('user-1', 7001, dotComEndpoint, 'token-alpha')
        const account2 = createTestAccount('user-2', 7002, dotComEndpoint, 'token-beta')

        await accountsStore.addAccount(account1)
        await accountsStore.addAccount(account2)

        // Verify both accounts exist with their respective tokens
        const accounts = await accountsStore.getAll()
        const user1 = accounts.find(a => a.login === 'user-1')
        const user2 = accounts.find(a => a.login === 'user-2')

        assert.ok(user1, 'user-1 should exist')
        assert.ok(user2, 'user-2 should exist')
        assert.equal(user1.token, 'token-alpha', 'user-1 should have correct token')
        assert.equal(user2.token, 'token-beta', 'user-2 should have correct token')
      })
    })

    describe('account persistence', () => {
      it('correctly loads multiple accounts from storage', async () => {
        const dataStore = new InMemoryStore()
        const secureStore = new AsyncInMemoryStore()

        // Pre-populate storage with multiple accounts
        dataStore.setItem(
          'users',
          JSON.stringify([
            {
              login: 'stored-user-1',
              endpoint: dotComEndpoint,
              token: '',
              emails: [],
              avatarURL: '',
              id: 8001,
              name: 'Stored User 1',
              plan: 'free',
            },
            {
              login: 'stored-user-2',
              endpoint: dotComEndpoint,
              token: '',
              emails: [],
              avatarURL: '',
              id: 8002,
              name: 'Stored User 2',
              plan: 'pro',
            },
          ])
        )

        // Pre-populate secure storage with tokens
        await secureStore.setItem(
          'GitHub Desktop Dev - https://api.github.com/stored-user-1',
          'stored-user-1',
          'secure-token-1'
        )
        await secureStore.setItem(
          'GitHub Desktop Dev - https://api.github.com/stored-user-2',
          'stored-user-2',
          'secure-token-2'
        )

        // Create a new store and load
        accountsStore = new AccountsStore(dataStore, secureStore)
        const accounts = await accountsStore.getAll()

        // Verify both accounts loaded correctly
        assert.equal(accounts.length, 2, 'Should have loaded 2 accounts')
        const logins = accounts.map(a => a.login)
        assert.ok(logins.includes('stored-user-1'))
        assert.ok(logins.includes('stored-user-2'))
      })

      it('persists multiple accounts correctly after modifications', async () => {
        const dataStore = new InMemoryStore()
        const secureStore = new AsyncInMemoryStore()
        accountsStore = new AccountsStore(dataStore, secureStore)

        // Add multiple accounts
        await accountsStore.addAccount(createTestAccount('persist-user-1', 9001))
        await accountsStore.addAccount(createTestAccount('persist-user-2', 9002))
        await accountsStore.addAccount(createTestAccount('persist-user-3', 9003))

        // Verify persisted data
        const persistedData = JSON.parse(dataStore.getItem('users'))
        assert.equal(persistedData.length, 3, 'Should have persisted 3 accounts')

        // Remove one account
        const accounts = await accountsStore.getAll()
        const accountToRemove = accounts.find(a => a.login === 'persist-user-2')
        assert.ok(accountToRemove)
        await accountsStore.removeAccount(accountToRemove)

        // Verify updated persisted data
        const updatedPersistedData = JSON.parse(dataStore.getItem('users'))
        assert.equal(updatedPersistedData.length, 2, 'Should have 2 accounts after removal')
        const persistedLogins = updatedPersistedData.map((a: { login: string }) => a.login)
        assert.ok(!persistedLogins.includes('persist-user-2'), 'Removed account should not be persisted')
      })
    })

    describe('account sorting', () => {
      it('sorts GitHub.com accounts before Enterprise accounts', async () => {
        const gheEndpoint = 'https://github.mycompany.com/api/v3'

        // Add accounts in mixed order
        await accountsStore.addAccount(createTestAccount('ghe-user', 10001, gheEndpoint))
        await accountsStore.addAccount(createTestAccount('dotcom-user-1', 10002))
        await accountsStore.addAccount(createTestAccount('dotcom-user-2', 10003))

        const accounts = await accountsStore.getAll()

        // First two should be GitHub.com accounts
        assert.equal(accounts[0].endpoint, dotComEndpoint, 'First account should be GitHub.com')
        assert.equal(accounts[1].endpoint, dotComEndpoint, 'Second account should be GitHub.com')
        assert.equal(accounts[2].endpoint, gheEndpoint, 'Third account should be GHE')
      })
    })
  })
})
