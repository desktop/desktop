/**
 * Security-focused unit tests for multi-account support.
 *
 * These tests verify that the multi-account implementation maintains
 * proper security boundaries between accounts, particularly around
 * token storage and isolation.
 *
 * Security is a primary concern because:
 * 1. OAuth tokens provide full access to user accounts
 * 2. Token leakage between accounts could lead to unauthorized access
 * 3. Improper cleanup could leave orphaned credentials
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { Account } from '../../src/models/account'
import { AccountsStore } from '../../src/lib/stores'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'
import { getKeyForAccount } from '../../src/lib/auth'

describe('Multi-Account Security', () => {
  let accountsStore: AccountsStore
  let dataStore: InMemoryStore
  let secureStore: AsyncInMemoryStore

  // Standard endpoint for testing
  const dotComEndpoint = 'https://api.github.com'

  /**
   * Helper function to create test accounts with unique tokens
   * that can be traced for verification.
   */
  function createTestAccount(
    login: string,
    id: number,
    token: string,
    endpoint: string = dotComEndpoint
  ): Account {
    return new Account(
      login,
      endpoint,
      token,
      [], // emails
      '', // avatarURL
      id,
      login, // name
      'free' // plan
    )
  }

  beforeEach(() => {
    dataStore = new InMemoryStore()
    secureStore = new AsyncInMemoryStore()
    accountsStore = new AccountsStore(dataStore, secureStore)
  })

  describe('token isolation', () => {
    it('stores tokens with unique keys per account', async () => {
      // Create two accounts with distinct tokens
      const account1 = createTestAccount('user-alice', 1001, 'token-alice-secret')
      const account2 = createTestAccount('user-bob', 1002, 'token-bob-secret')

      await accountsStore.addAccount(account1)
      await accountsStore.addAccount(account2)

      // Verify keys are different
      const key1 = getKeyForAccount(account1)
      const key2 = getKeyForAccount(account2)

      assert.notEqual(key1, key2, 'Account keys must be unique')

      // Verify each account has its own token
      const accounts = await accountsStore.getAll()
      const alice = accounts.find(a => a.login === 'user-alice')
      const bob = accounts.find(a => a.login === 'user-bob')

      assert.ok(alice, 'Alice account should exist')
      assert.ok(bob, 'Bob account should exist')
      assert.equal(alice.token, 'token-alice-secret', 'Alice should have her token')
      assert.equal(bob.token, 'token-bob-secret', 'Bob should have his token')
      assert.notEqual(alice.token, bob.token, 'Tokens must be different')
    })

    it('cannot access token from wrong account login', async () => {
      // Add an account
      const account = createTestAccount('secure-user', 2001, 'my-secret-token')
      await accountsStore.addAccount(account)

      // Try to retrieve token with wrong login
      // The secure store should not return the token for a different login
      const key = getKeyForAccount(account)
      const wrongLoginToken = await secureStore.getItem(key, 'wrong-user')

      // Should not be able to get the token with wrong login
      assert.ok(
        wrongLoginToken === null || wrongLoginToken !== 'my-secret-token',
        'Should not retrieve token with wrong login'
      )
    })

    it('tokens are not cross-accessible between accounts', async () => {
      // Add multiple accounts
      const account1 = createTestAccount('user-1', 3001, 'secret-1')
      const account2 = createTestAccount('user-2', 3002, 'secret-2')
      const account3 = createTestAccount('user-3', 3003, 'secret-3')

      await accountsStore.addAccount(account1)
      await accountsStore.addAccount(account2)
      await accountsStore.addAccount(account3)

      // Verify each account has only its own token
      const accounts = await accountsStore.getAll()

      for (const account of accounts) {
        const expectedToken = `secret-${account.login.split('-')[1]}`
        assert.equal(
          account.token,
          expectedToken,
          `Account ${account.login} should only have its own token`
        )
      }
    })
  })

  describe('secure token removal', () => {
    it('removes only the target account token on sign out', async () => {
      // Add multiple accounts
      const accountToRemove = createTestAccount('remove-me', 4001, 'token-to-delete')
      const accountToKeep = createTestAccount('keep-me', 4002, 'token-to-keep')

      await accountsStore.addAccount(accountToRemove)
      await accountsStore.addAccount(accountToKeep)

      // Verify both accounts exist
      let accounts = await accountsStore.getAll()
      assert.equal(accounts.length, 2)

      // Remove one account
      await accountsStore.removeAccount(accountToRemove)

      // Verify only one account remains
      accounts = await accountsStore.getAll()
      assert.equal(accounts.length, 1)
      assert.equal(accounts[0].login, 'keep-me')
      assert.equal(accounts[0].token, 'token-to-keep', 'Remaining account should have its token')
    })

    it('completely removes token from secure storage on sign out', async () => {
      const account = createTestAccount('temp-user', 5001, 'temporary-token')
      await accountsStore.addAccount(account)

      // Verify token is stored
      const key = getKeyForAccount(account)
      let storedToken = await secureStore.getItem(key, account.login)
      assert.equal(storedToken, 'temporary-token', 'Token should be stored')

      // Remove account
      await accountsStore.removeAccount(account)

      // Verify token is completely removed from secure storage
      storedToken = await secureStore.getItem(key, account.login)
      assert.ok(
        storedToken === null || storedToken === undefined,
        'Token should be completely removed from secure storage'
      )
    })

    it('removing one account does not affect other accounts tokens', async () => {
      // Add three accounts
      const account1 = createTestAccount('survivor-1', 6001, 'token-1')
      const account2 = createTestAccount('to-delete', 6002, 'token-2')
      const account3 = createTestAccount('survivor-2', 6003, 'token-3')

      await accountsStore.addAccount(account1)
      await accountsStore.addAccount(account2)
      await accountsStore.addAccount(account3)

      // Remove the middle account
      await accountsStore.removeAccount(account2)

      // Verify remaining accounts have their correct tokens
      const accounts = await accountsStore.getAll()
      assert.equal(accounts.length, 2)

      const survivor1 = accounts.find(a => a.login === 'survivor-1')
      const survivor2 = accounts.find(a => a.login === 'survivor-2')

      assert.ok(survivor1)
      assert.ok(survivor2)
      assert.equal(survivor1.token, 'token-1', 'First survivor token intact')
      assert.equal(survivor2.token, 'token-3', 'Second survivor token intact')
    })
  })

  describe('token serialization security', () => {
    it('does not expose tokens in account serialization to data store', async () => {
      const account = createTestAccount('test-user', 7001, 'super-secret-token')
      await accountsStore.addAccount(account)

      // Get the raw persisted data
      const persistedData = dataStore.getItem('users')
      assert.ok(persistedData, 'Data should be persisted')

      // Parse and verify tokens are not in the data store
      const parsedData = JSON.parse(persistedData)
      const persistedAccount = parsedData[0]

      // The token should either be empty or not contain the actual secret
      assert.ok(
        persistedAccount.token === '' || 
        persistedAccount.token !== 'super-secret-token',
        'Token should not be exposed in data store serialization'
      )
    })

    it('tokens are stored only in secure storage', async () => {
      const account = createTestAccount('secure-storage-user', 8001, 'only-in-secure-storage')
      await accountsStore.addAccount(account)

      // Verify token IS in secure storage
      const key = getKeyForAccount(account)
      const secureToken = await secureStore.getItem(key, account.login)
      assert.equal(secureToken, 'only-in-secure-storage', 'Token should be in secure storage')

      // Verify token is NOT in regular data store
      const rawData = dataStore.getItem('users')
      assert.ok(!rawData.includes('only-in-secure-storage'), 
        'Token should not appear in regular data store')
    })
  })

  describe('endpoint boundary security', () => {
    it('accounts from different endpoints have completely separate keys', async () => {
      const dotComAccount = createTestAccount('user', 9001, 'dotcom-token', 'https://api.github.com')
      const gheAccount = createTestAccount('user', 9002, 'ghe-token', 'https://github.company.com/api/v3')

      const dotComKey = getKeyForAccount(dotComAccount)
      const gheKey = getKeyForAccount(gheAccount)

      assert.notEqual(dotComKey, gheKey, 
        'Same login on different endpoints must have different keys')
    })

    it('tokens do not leak between endpoints', async () => {
      // Add accounts with same login but different endpoints
      const dotComAccount = createTestAccount('shared-login', 10001, 'dotcom-secret', 'https://api.github.com')
      const gheAccount = createTestAccount('shared-login', 10002, 'ghe-secret', 'https://github.company.com/api/v3')

      await accountsStore.addAccount(dotComAccount)
      await accountsStore.addAccount(gheAccount)

      // Verify each has its own token
      const accounts = await accountsStore.getAll()
      const dotcom = accounts.find(a => a.endpoint === 'https://api.github.com')
      const ghe = accounts.find(a => a.endpoint === 'https://github.company.com/api/v3')

      assert.ok(dotcom)
      assert.ok(ghe)
      assert.equal(dotcom.token, 'dotcom-secret')
      assert.equal(ghe.token, 'ghe-secret')
    })
  })
})
