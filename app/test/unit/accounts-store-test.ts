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
      expect(users[0].login).toBe(newAccountLogin)
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
      expect(users[0].login).toBe('joan')
      expect(users[0].endpoint).toBe('https://api.whatever.ghe.com/')

      const persistedUsers = JSON.parse(dataStore.getItem('users'))
      expect(persistedUsers[0].login).toBe('joan')
      expect(persistedUsers[0].endpoint).toBe('https://api.whatever.ghe.com/')
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
      expect(users[0].login).toBe('joan')
      expect(users[0].endpoint).toBe('https://api.whatever.ghe.com/')

      const persistedUsers = JSON.parse(dataStore.getItem('users'))
      expect(persistedUsers[0].login).toBe('joan')
      expect(persistedUsers[0].endpoint).toBe('https://api.whatever.ghe.com/')
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
      expect(users[0].login).toBe('joan')
      expect(users[0].endpoint).toBe('https://my-company-repos.com/api/v3')

      const persistedUsers = JSON.parse(dataStore.getItem('users'))
      expect(persistedUsers[0].login).toBe('joan')
      expect(persistedUsers[0].endpoint).toBe(
        'https://my-company-repos.com/api/v3'
      )
    })
  })
})
