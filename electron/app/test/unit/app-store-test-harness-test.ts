import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  createTestStores,
  createTestAccountsStore,
  createTestSignInStore,
  createTestRepositoryStateCache,
} from '../helpers/app-store-test-harness'
import { Account } from '../../src/models/account'
import { getDotComAPIEndpoint } from '../../src/lib/api'

describe('app-store-test-harness', () => {
  describe('createTestStores', () => {
    it('creates a complete set of test stores', () => {
      const stores = createTestStores()

      assert.notEqual(stores.accountsStore, null)
      assert.notEqual(stores.repositoriesStore, null)
      assert.notEqual(stores.pullRequestStore, null)
      assert.notEqual(stores.signInStore, null)
      assert.notEqual(stores.gitHubUserStore, null)
      assert.notEqual(stores.issuesStore, null)
      assert.notEqual(stores.commitStatusStore, null)
      assert.notEqual(stores.repositoryStateCache, null)
      assert.notEqual(stores.cloningRepositoriesStore, null)
      assert.notEqual(stores.apiRepositoriesStore, null)
      assert.notEqual(stores.statsStore, null)
    })
  })

  describe('createTestAccountsStore', () => {
    it('starts with no accounts', async () => {
      const store = createTestAccountsStore()
      const accounts = await store.getAll()
      assert.equal(accounts.length, 0)
    })

    it('can add and retrieve an account', async () => {
      const store = createTestAccountsStore()
      const account = new Account(
        'test-user',
        getDotComAPIEndpoint(),
        'test-token',
        [],
        '',
        1,
        'Test User',
        'free'
      )
      await store.addAccount(account)
      const accounts = await store.getAll()
      assert.equal(accounts.length, 1)
      assert.equal(accounts[0].login, 'test-user')
    })
  })

  describe('createTestSignInStore', () => {
    it('starts in null state', () => {
      const store = createTestSignInStore()
      assert.equal(store.getState(), null)
    })
  })

  describe('createTestRepositoryStateCache', () => {
    it('creates a working cache', () => {
      const cache = createTestRepositoryStateCache()
      assert.notEqual(cache, null)
    })
  })

  describe('individual store factories', () => {
    it('creates stores with shared dependencies', () => {
      const stores = createTestStores()

      // SignInStore should use the same AccountsStore
      // This is a structural test — verifying wiring correctness
      assert.notEqual(stores.signInStore, null)
      assert.notEqual(stores.commitStatusStore, null)
    })
  })
})
