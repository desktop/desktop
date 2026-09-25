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
    for (const endpoint of [
      'https://api.github.com',
      'https://enterprise.example.com/api/v3',
    ]) {
      it(`retains multiple users and their tokens at ${endpoint}`, async () => {
        const dataStore = new InMemoryStore()
        const secureStore = new AsyncInMemoryStore()
        const store = new AccountsStore(dataStore, secureStore)
        const first = new Account(
          'first',
          endpoint,
          'first-token',
          [],
          '',
          1,
          ''
        )
        const second = new Account(
          'second',
          endpoint,
          'second-token',
          [],
          '',
          2,
          ''
        )
        await store.addAccount(first)
        await store.addAccount(second)

        assert.deepStrictEqual(await store.getAll(), [first, second])
        const reloaded = new AccountsStore(dataStore, secureStore)
        assert.deepStrictEqual(await reloaded.getAll(), [first, second])
        await reloaded.removeAccount(first)
        assert.deepStrictEqual(await reloaded.getAll(), [second])
      })
    }

    it('refreshes the same endpoint and login case-insensitively without changing order', async () => {
      const first = new Account(
        'first',
        'https://enterprise.example.com/api/v3',
        'old-token',
        [],
        '',
        1,
        ''
      )
      const second = new Account(
        'second',
        'https://enterprise.example.com/api/v3',
        'second-token',
        [],
        '',
        2,
        ''
      )
      const refreshed = new Account(
        'FIRST',
        'https://ENTERPRISE.EXAMPLE.COM/API/V3',
        'new-token',
        [],
        '',
        1,
        ''
      )
      await accountsStore.addAccount(first)
      await accountsStore.addAccount(second)
      await accountsStore.addAccount(refreshed)

      assert.deepStrictEqual(await accountsStore.getAll(), [refreshed, second])
    })

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
})
