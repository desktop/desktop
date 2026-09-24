import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { Account } from '../../src/models/account'
import { AccountsStore } from '../../src/lib/stores'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'
import { getKeyForEndpoint } from '../../src/lib/auth'

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
      assert.equal(users[0].endpoint, 'https://api.whatever.ghe.com')

      const persistedUsers = JSON.parse(dataStore.getItem('users'))
      assert.equal(persistedUsers[0].login, 'joan')
      assert.equal(persistedUsers[0].endpoint, 'https://api.whatever.ghe.com')
    })

    it('migrates .ghe.com users with a trailing slash in their endpoint', async () => {
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
      assert.equal(users[0].endpoint, 'https://api.whatever.ghe.com')

      const persistedUsers = JSON.parse(dataStore.getItem('users'))
      assert.equal(persistedUsers[0].login, 'joan')
      assert.equal(persistedUsers[0].endpoint, 'https://api.whatever.ghe.com')
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

    it('does NOT migrate .ghe.com users already using the canonical endpoint', async () => {
      const dataStore = new InMemoryStore()
      dataStore.setItem(
        'users',
        JSON.stringify([persistedUser('https://api.whatever.ghe.com')])
      )
      const secureStore = new AsyncInMemoryStore()
      await secureStore.setItem(
        getKeyForEndpoint('https://api.whatever.ghe.com'),
        'joan',
        'deadbeef'
      )
      accountsStore = new AccountsStore(dataStore, secureStore)

      const users = await accountsStore.getAll()
      assert.equal(users[0].endpoint, 'https://api.whatever.ghe.com')
      assert.equal(users[0].token, 'deadbeef')
    })
  })

  describe('migrating tokens of .ghe.com users', () => {
    const canonicalEndpoint = 'https://api.whatever.ghe.com'

    const legacyEndpoints = [
      'https://api.whatever.ghe.com/',
      'https://whatever.ghe.com/api/v3',
    ]

    for (const legacyEndpoint of legacyEndpoints) {
      it(`moves the token from ${legacyEndpoint} to the canonical key`, async () => {
        const dataStore = new InMemoryStore()
        dataStore.setItem(
          'users',
          JSON.stringify([persistedUser(legacyEndpoint)])
        )
        const secureStore = new AsyncInMemoryStore()
        const legacyKey = getKeyForEndpoint(legacyEndpoint)
        const canonicalKey = getKeyForEndpoint(canonicalEndpoint)
        await secureStore.setItem(legacyKey, 'joan', 'deadbeef')

        accountsStore = new AccountsStore(dataStore, secureStore)

        const users = await accountsStore.getAll()
        assert.equal(users[0].endpoint, canonicalEndpoint)
        assert.equal(users[0].token, 'deadbeef')

        assert.equal(
          await secureStore.getItem(canonicalKey, 'joan'),
          'deadbeef'
        )
        assert.equal(await secureStore.getItem(legacyKey, 'joan'), null)

        // Reloading from the persisted (migrated) state keeps the token
        const reloadedStore = new AccountsStore(dataStore, secureStore)
        const reloadedUsers = await reloadedStore.getAll()
        assert.equal(reloadedUsers[0].endpoint, canonicalEndpoint)
        assert.equal(reloadedUsers[0].token, 'deadbeef')
      })
    }

    it('recovers tokens lost by a previous endpoint migration', async () => {
      // Previous versions migrated the endpoint from /api/v3 to the api.
      // subdomain without moving the token, leaving it under the old key.
      const dataStore = new InMemoryStore()
      dataStore.setItem(
        'users',
        JSON.stringify([persistedUser('https://api.whatever.ghe.com/')])
      )
      const secureStore = new AsyncInMemoryStore()
      const legacyKey = getKeyForEndpoint('https://whatever.ghe.com/api/v3')
      await secureStore.setItem(legacyKey, 'joan', 'deadbeef')

      accountsStore = new AccountsStore(dataStore, secureStore)

      const users = await accountsStore.getAll()
      assert.equal(users[0].endpoint, canonicalEndpoint)
      assert.equal(users[0].token, 'deadbeef')
      assert.equal(
        await secureStore.getItem(getKeyForEndpoint(canonicalEndpoint), 'joan'),
        'deadbeef'
      )
      assert.equal(await secureStore.getItem(legacyKey, 'joan'), null)
    })

    it('prefers a token already stored under the canonical key', async () => {
      const dataStore = new InMemoryStore()
      dataStore.setItem(
        'users',
        JSON.stringify([persistedUser('https://api.whatever.ghe.com/')])
      )
      const secureStore = new AsyncInMemoryStore()
      const legacyKey = getKeyForEndpoint('https://api.whatever.ghe.com/')
      await secureStore.setItem(legacyKey, 'joan', 'old')
      await secureStore.setItem(
        getKeyForEndpoint(canonicalEndpoint),
        'joan',
        'new'
      )

      accountsStore = new AccountsStore(dataStore, secureStore)

      const users = await accountsStore.getAll()
      assert.equal(users[0].token, 'new')
      assert.equal(await secureStore.getItem(legacyKey, 'joan'), 'old')
    })

    it('keeps the legacy token if it cannot be moved', async () => {
      const dataStore = new InMemoryStore()
      dataStore.setItem(
        'users',
        JSON.stringify([persistedUser('https://api.whatever.ghe.com/')])
      )
      const secureStore = new AsyncInMemoryStore()
      const legacyKey = getKeyForEndpoint('https://api.whatever.ghe.com/')
      await secureStore.setItem(legacyKey, 'joan', 'deadbeef')
      secureStore.setItem = () => Promise.reject(new Error('locked keychain'))

      accountsStore = new AccountsStore(dataStore, secureStore)

      const users = await accountsStore.getAll()
      assert.equal(users[0].token, 'deadbeef')
      assert.equal(await secureStore.getItem(legacyKey, 'joan'), 'deadbeef')
    })
  })
})

function persistedUser(endpoint: string) {
  return {
    login: 'joan',
    endpoint,
    token: '',
    emails: [],
    avatarURL: '',
    id: 1,
    name: '',
    plan: 'free',
  }
}
