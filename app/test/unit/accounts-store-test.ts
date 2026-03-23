import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { Account } from '../../src/models/account'
import { AccountsStore } from '../../src/lib/stores'
import { getKeyForAccount } from '../../src/lib/auth'
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

  describe('syncing from IPC', () => {
    it('loads synced users with tokens from secure storage', async () => {
      const dataStore = new InMemoryStore()
      const secureStore = new AsyncInMemoryStore()
      accountsStore = new AccountsStore(dataStore, secureStore)

      const account = new Account(
        'joan',
        'https://api.github.com',
        'deadbeef',
        [],
        '',
        1,
        'Joan',
        'free'
      )
      await secureStore.setItem(
        getKeyForAccount(account),
        account.login,
        account.token
      )

      let syncStateDuringUpdate: boolean | null = null
      accountsStore.onDidUpdate(() => {
        syncStateDuringUpdate = accountsStore.isSyncing
      })

      await accountsStore.syncFromIPC(JSON.stringify([account.withToken('')]))

      const users = await accountsStore.getAll()
      assert.equal(users.length, 1)
      assert.equal(users[0].login, 'joan')
      assert.equal(users[0].token, 'deadbeef')
      assert.equal(syncStateDuringUpdate, true)
      assert.equal(accountsStore.isSyncing, false)

      const persistedUsers = JSON.parse(dataStore.getItem('users'))
      assert.equal(persistedUsers[0].login, 'joan')
      assert.equal(persistedUsers[0].token, '')
    })

    it('ignores invalid IPC payloads without changing existing accounts', async () => {
      const account = new Account(
        'joan',
        'https://api.github.com',
        'deadbeef',
        [],
        '',
        1,
        'Joan',
        'free'
      )
      await accountsStore.addAccount(account)

      await accountsStore.syncFromIPC('{not json')

      const users = await accountsStore.getAll()
      assert.equal(users.length, 1)
      assert.equal(users[0].login, 'joan')
      assert.equal(users[0].token, 'deadbeef')
    })
  })
})
