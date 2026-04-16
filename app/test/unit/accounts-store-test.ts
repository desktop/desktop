import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { Account } from '../../src/models/account'
import { getDotComAPIEndpoint } from '../../src/lib/api'
import { AccountsStore } from '../../src/lib/stores'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'

function createAccount(
  login: string,
  endpoint: string,
  id: number,
  token: string = 'deadbeef'
) {
  return new Account(login, endpoint, token, [], '', id, login, 'free')
}

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
      await accountsStore.addAccount(createAccount(newAccountLogin, '', 1))

      const users = await accountsStore.getAll()
      assert.equal(users[0].login, newAccountLogin)
    })

    it('keeps multiple accounts on the same endpoint and promotes the newest one', async () => {
      const endpoint = getDotComAPIEndpoint()
      await accountsStore.addAccount(createAccount('mona', endpoint, 1))
      await accountsStore.addAccount(createAccount('hubot', endpoint, 2))

      const users = await accountsStore.getAll()
      assert.deepEqual(
        users.map(account => account.login),
        ['hubot', 'mona']
      )
    })

    it('replaces the same account identity instead of duplicating it', async () => {
      const endpoint = getDotComAPIEndpoint()
      await accountsStore.addAccount(createAccount('mona', endpoint, 1, 'old'))
      await accountsStore.addAccount(createAccount('mona', endpoint, 1, 'new'))

      const users = await accountsStore.getAll()
      assert.equal(users.length, 1)
      assert.equal(users[0].token, 'new')
    })
  })

  describe('active accounts', () => {
    it('can promote an existing same-endpoint account to active', async () => {
      const endpoint = getDotComAPIEndpoint()
      const firstAccount = createAccount('mona', endpoint, 1)
      const secondAccount = createAccount('hubot', endpoint, 2)

      await accountsStore.addAccount(firstAccount)
      await accountsStore.addAccount(secondAccount)
      await accountsStore.setActiveAccount(firstAccount)

      const users = await accountsStore.getAll()
      assert.deepEqual(
        users.map(account => account.login),
        ['mona', 'hubot']
      )
    })

    it('promotes the next account when the active one is removed', async () => {
      const endpoint = getDotComAPIEndpoint()
      const firstAccount = createAccount('mona', endpoint, 1)
      const secondAccount = createAccount('hubot', endpoint, 2)

      await accountsStore.addAccount(firstAccount)
      await accountsStore.addAccount(secondAccount)
      await accountsStore.removeAccount(secondAccount)

      const users = await accountsStore.getAll()
      assert.deepEqual(
        users.map(account => account.login),
        ['mona']
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
