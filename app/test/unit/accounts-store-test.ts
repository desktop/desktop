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

    it('retains two accounts on the same host', async () => {
      const endpoint = 'https://api.github.com'
      await accountsStore.addAccount(
        new Account('joan', endpoint, 'first-token', [], '', 1, '', 'free')
      )
      await accountsStore.addAccount(
        new Account('alex', endpoint, 'second-token', [], '', 2, '', 'free')
      )

      const accounts = await accountsStore.getAll()
      assert.deepStrictEqual(
        accounts.map(account => account.login),
        ['joan', 'alex']
      )
      assert.deepStrictEqual(
        accounts.map(account => account.token),
        ['first-token', 'second-token']
      )
    })

    it('replaces the credentials of a known account without removing another', async () => {
      const endpoint = 'https://api.github.com'
      await accountsStore.addAccount(
        new Account('joan', endpoint, 'old-token', [], '', 1, '', 'free')
      )
      await accountsStore.addAccount(
        new Account('alex', endpoint, 'other-token', [], '', 2, '', 'free')
      )

      await accountsStore.addAccount(
        new Account('joan', endpoint, 'new-token', [], '', 1, '', 'free')
      )

      const accounts = await accountsStore.getAll()
      assert.deepStrictEqual(
        accounts.map(account => [account.login, account.token]),
        [
          ['joan', 'new-token'],
          ['alex', 'other-token'],
        ]
      )
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

      const users = await accountsStore.getKnownAccounts()
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

      const users = await accountsStore.getKnownAccounts()
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

      const users = await accountsStore.getKnownAccounts()
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

  describe('signing out', () => {
    it('retains the account identity without keeping it signed in', async () => {
      const dataStore = new InMemoryStore()
      const secureStore = new AsyncInMemoryStore()
      accountsStore = new AccountsStore(dataStore, secureStore)
      const account = new Account(
        'joan',
        'https://api.github.com',
        'token',
        [],
        '',
        1,
        'Joan'
      )
      await accountsStore.addAccount(account)

      await accountsStore.removeAccount(account)

      assert.deepStrictEqual(await accountsStore.getAll(), [])
      assert.deepStrictEqual(
        (await accountsStore.getKnownAccounts()).map(known => [
          known.login,
          known.token,
        ]),
        [['joan', '']]
      )
      assert.deepStrictEqual(
        (
          await new AccountsStore(dataStore, secureStore).getKnownAccounts()
        ).map(known => known.login),
        ['joan']
      )
    })
  })
})
