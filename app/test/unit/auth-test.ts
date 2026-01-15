/**
 * Unit tests for the auth module.
 *
 * These tests verify the authentication key generation logic, particularly
 * for multi-account support where we need unique keys for each account
 * even when they share the same endpoint.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Account } from '../../src/models/account'
import {
  getKeyForAccount,
  getKeyForEndpoint,
  getKeyForEndpointAndLogin,
} from '../../src/lib/auth'

describe('auth', () => {
  describe('getKeyForEndpoint', () => {
    it('generates a key containing the endpoint', () => {
      const endpoint = 'https://api.github.com'
      const key = getKeyForEndpoint(endpoint)

      assert.ok(key.includes(endpoint), 'Key should contain the endpoint')
      assert.ok(key.includes('GitHub'), 'Key should contain app name')
    })

    it('generates different keys for different endpoints', () => {
      const dotComKey = getKeyForEndpoint('https://api.github.com')
      const gheKey = getKeyForEndpoint('https://github.mycompany.com/api/v3')

      assert.notEqual(dotComKey, gheKey, 'Keys should be different for different endpoints')
    })
  })

  describe('getKeyForEndpointAndLogin', () => {
    it('generates a key containing both endpoint and login', () => {
      const endpoint = 'https://api.github.com'
      const login = 'testuser'
      const key = getKeyForEndpointAndLogin(endpoint, login)

      assert.ok(key.includes(endpoint), 'Key should contain the endpoint')
      assert.ok(key.includes(login), 'Key should contain the login')
      assert.ok(key.includes('GitHub'), 'Key should contain app name')
    })

    it('generates different keys for different logins on same endpoint', () => {
      const endpoint = 'https://api.github.com'
      const key1 = getKeyForEndpointAndLogin(endpoint, 'user-one')
      const key2 = getKeyForEndpointAndLogin(endpoint, 'user-two')

      assert.notEqual(key1, key2, 'Keys should be different for different logins')
    })

    it('generates different keys for same login on different endpoints', () => {
      const login = 'shared-username'
      const key1 = getKeyForEndpointAndLogin('https://api.github.com', login)
      const key2 = getKeyForEndpointAndLogin('https://github.company.com/api/v3', login)

      assert.notEqual(key1, key2, 'Keys should be different for different endpoints')
    })
  })

  describe('getKeyForAccount', () => {
    /**
     * Helper function to create a test Account with minimal required properties.
     */
    function createTestAccount(
      login: string,
      endpoint: string,
      id: number = 12345
    ): Account {
      return new Account(
        login,
        endpoint,
        'test-token',
        [], // emails
        '', // avatarURL
        id,
        login, // name
        'free' // plan
      )
    }

    it('generates unique keys for different accounts on same endpoint', () => {
      const endpoint = 'https://api.github.com'
      const account1 = createTestAccount('personal-account', endpoint, 1001)
      const account2 = createTestAccount('work-account', endpoint, 1002)

      const key1 = getKeyForAccount(account1)
      const key2 = getKeyForAccount(account2)

      assert.notEqual(
        key1,
        key2,
        'Keys should be unique for different accounts on the same endpoint'
      )
    })

    it('generates the same key for the same account', () => {
      const account = createTestAccount('consistent-user', 'https://api.github.com', 2001)

      const key1 = getKeyForAccount(account)
      const key2 = getKeyForAccount(account)

      assert.equal(key1, key2, 'Keys should be consistent for the same account')
    })

    it('includes login in the key to ensure uniqueness', () => {
      const account = createTestAccount('my-login', 'https://api.github.com', 3001)
      const key = getKeyForAccount(account)

      assert.ok(
        key.includes('my-login'),
        'Key should include the login for uniqueness'
      )
    })

    it('handles special characters in login names', () => {
      // Some usernames might have special characters (though GitHub restricts them,
      // we should handle edge cases gracefully)
      const account = createTestAccount('user-with-dashes', 'https://api.github.com', 4001)
      const key = getKeyForAccount(account)

      assert.ok(key.length > 0, 'Key should be generated even with special characters')
      assert.ok(key.includes('user-with-dashes'), 'Key should contain the full login')
    })
  })

  describe('key format security', () => {
    it('does not include the token in the key', () => {
      const account = new Account(
        'testuser',
        'https://api.github.com',
        'super-secret-token-12345',
        [],
        '',
        5001,
        'Test User',
        'free'
      )

      const key = getKeyForAccount(account)

      assert.ok(
        !key.includes('super-secret-token'),
        'Key should never contain the token'
      )
    })

    it('generates keys that are safe for use as keychain identifiers', () => {
      const account = new Account(
        'testuser',
        'https://api.github.com',
        'token',
        [],
        '',
        6001,
        'Test User',
        'free'
      )

      const key = getKeyForAccount(account)

      // Key should not contain problematic characters for keychain systems
      assert.ok(!key.includes('\n'), 'Key should not contain newlines')
      assert.ok(!key.includes('\0'), 'Key should not contain null characters')
    })
  })
})
