import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { Account } from '../../src/models/account'
import { AccountsStore } from '../../src/lib/stores'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'
import { getKeyForAccount, getKeyForEndpoint } from '../../src/lib/auth'

const endpoint = 'https://api.github.com'
const account = (login: string, id: number, token: string) =>
  new Account(login, endpoint, token, [], '', id, login, 'free')

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

    it('retains two accounts on the same endpoint across a restart', async () => {
      const dataStore = new InMemoryStore()
      const secureStore = new AsyncInMemoryStore()
      const store = new AccountsStore(dataStore, secureStore)
      await store.addAccount(account('work', 1, 'work-token'))
      await store.addAccount(account('personal', 2, 'personal-token'))

      const reloaded = new AccountsStore(dataStore, secureStore)
      const users = await reloaded.getAll()
      assert.deepStrictEqual(
        users.map(a => [a.login, a.token]),
        [
          ['work', 'work-token'],
          ['personal', 'personal-token'],
        ]
      )
    })

    it('replaces credentials for the same identity without changing another', async () => {
      await accountsStore.addAccount(account('work', 1, 'first-token'))
      await accountsStore.addAccount(account('personal', 2, 'personal-token'))
      await accountsStore.addAccount(account('work', 1, 'refreshed-token'))

      const users = await accountsStore.getAll()
      assert.equal(users.length, 2)
      assert.equal(users.find(a => a.id === 1)?.token, 'refreshed-token')
      assert.equal(users.find(a => a.id === 2)?.token, 'personal-token')
    })

    it('moves the keychain login when a known identity changes login', async () => {
      const dataStore = new InMemoryStore()
      const secureStore = new AsyncInMemoryStore()
      const store = new AccountsStore(dataStore, secureStore)
      await store.addAccount(account('old-login', 1, 'old-token'))
      await store.addAccount(account('new-login', 1, 'new-token'))

      assert.strictEqual(
        await secureStore.getItem(
          getKeyForAccount(account('old-login', 1, '')),
          'old-login'
        ),
        null
      )
      assert.strictEqual(
        (await new AccountsStore(dataStore, secureStore).getAll())[0].token,
        'new-token'
      )
    })

    it('retains a signed-out account identity without its credentials', async () => {
      const dataStore = new InMemoryStore()
      const secureStore = new AsyncInMemoryStore()
      const store = new AccountsStore(dataStore, secureStore)
      const work = account('work', 1, 'work-token')
      await store.addAccount(work)
      await store.addAccount(account('personal', 2, 'personal-token'))
      await store.removeAccount(work)

      const reloaded = new AccountsStore(dataStore, secureStore)
      assert.deepStrictEqual(
        (await reloaded.getAll()).map(a => a.login),
        ['personal']
      )
      assert.deepStrictEqual(
        (await reloaded.getKnownAccounts()).map(a => [a.login, a.token]),
        [
          ['work', ''],
          ['personal', ''],
        ]
      )
    })
  })

  describe('loading persisted users', () => {
    it('moves a legacy host-keyed credential without losing the account', async () => {
      const dataStore = new InMemoryStore()
      const secureStore = new AsyncInMemoryStore()
      const existing = account('work', 1, '')
      dataStore.setItem('users', JSON.stringify([existing]))
      await secureStore.setItem(
        getKeyForEndpoint(endpoint),
        existing.login,
        'legacy-token'
      )

      const store = new AccountsStore(dataStore, secureStore)
      assert.equal((await store.getAll())[0].token, 'legacy-token')
      assert.equal(
        await secureStore.getItem(getKeyForAccount(existing), existing.login),
        'legacy-token'
      )
      assert.equal(
        await secureStore.getItem(getKeyForEndpoint(endpoint), existing.login),
        null
      )
    })

    it('moves a legacy GHE credential from its old endpoint key', async () => {
      const dataStore = new InMemoryStore()
      const secureStore = new AsyncInMemoryStore()
      const oldEndpoint = 'https://whatever.ghe.com/api/v3'
      const existing = new Account(
        'joan',
        oldEndpoint,
        '',
        [],
        '',
        1,
        'Joan',
        'free'
      )
      dataStore.setItem('users', JSON.stringify([existing]))
      await secureStore.setItem(
        getKeyForEndpoint(oldEndpoint),
        existing.login,
        'legacy-token'
      )

      const store = new AccountsStore(dataStore, secureStore)
      const [migrated] = await store.getAll()
      assert.strictEqual(migrated.endpoint, 'https://api.whatever.ghe.com/')
      assert.strictEqual(migrated.token, 'legacy-token')
      assert.strictEqual(
        await secureStore.getItem(getKeyForAccount(migrated), 'joan'),
        'legacy-token'
      )
    })
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

      const persistedUsers = JSON.parse(dataStore.getItem('known-users'))
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

      const persistedUsers = JSON.parse(dataStore.getItem('known-users'))
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

      const persistedUsers = JSON.parse(dataStore.getItem('known-users'))
      assert.equal(persistedUsers[0].login, 'joan')
      assert.equal(
        persistedUsers[0].endpoint,
        'https://my-company-repos.com/api/v3'
      )
    })
  })
})
