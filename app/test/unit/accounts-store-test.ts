import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { Account } from '../../src/models/account'
import { AccountsStore } from '../../src/lib/stores'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'
import { TokenRefreshEvent } from '../../src/lib/credential-sessions'
import { OAuthRefreshRejectedError } from '../../src/lib/oauth-token'

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

  it('publishes credential-free renewal events and supports unsubscribing', async t => {
    const account = new Account(
      'octocat',
      'https://api.github.com',
      'old-access',
      [],
      '',
      1,
      'Octocat'
    )
    const store = new AccountsStore(
      new InMemoryStore(),
      new AsyncInMemoryStore(),
      async () => ({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        expiresAt: Date.now() + 8 * 60 * 60_000,
      })
    )
    await store.addAccount(account, {
      accessToken: account.token,
      refreshToken: 'old-refresh',
      expiresAt: 0,
    })
    const events: TokenRefreshEvent[] = []
    const subscription = store.onTokenRefreshEvent(event => events.push(event))
    t.after(() => subscription.dispose())
    await store.getAccountWithFreshToken(account)
    assert.deepEqual(events, ['attempt', 'success'])
    subscription.dispose()
    await store.addAccount(account, {
      accessToken: account.token,
      refreshToken: 'another-refresh',
      expiresAt: 0,
    })
    await store.getAccountWithFreshToken(account)
    assert.deepEqual(events, ['attempt', 'success'])
  })

  it('counts actual renewal sign-outs even if deleting secure storage fails', async t => {
    const secure = new AsyncInMemoryStore()
    const store = new AccountsStore(new InMemoryStore(), secure, async () => {
      throw new OAuthRefreshRejectedError()
    })
    const account = new Account(
      'octocat',
      'https://api.github.com',
      'old-access',
      [],
      '',
      1,
      'Octocat'
    )
    await store.addAccount(account, {
      accessToken: account.token,
      refreshToken: 'old-refresh',
      expiresAt: 0,
    })
    const events: TokenRefreshEvent[] = []
    const subscription = store.onTokenRefreshEvent(event => events.push(event))
    t.after(() => subscription.dispose())
    const deletion = t.mock.method(secure, 'deleteItem', async () => {
      throw new Error('Secure deletion failed')
    })
    await assert.rejects(
      store.getAccountWithFreshToken(account),
      OAuthRefreshRejectedError
    )
    assert.equal(deletion.mock.callCount(), 1)
    assert.deepEqual(await store.getAll(), [])
    assert.deepEqual(events, [
      'attempt',
      'non-transient-failure',
      'required-sign-in',
    ])
  })

  it('edits expiry without publishing an account change or triggering renewal', async t => {
    const previousPreview = process.env.GITHUB_DESKTOP_PREVIEW_FEATURES
    process.env.GITHUB_DESKTOP_PREVIEW_FEATURES = '1'
    t.after(() => {
      if (previousPreview === undefined) {
        delete process.env.GITHUB_DESKTOP_PREVIEW_FEATURES
      } else {
        process.env.GITHUB_DESKTOP_PREVIEW_FEATURES = previousPreview
      }
    })
    const now = Date.now()
    const account = new Account(
      'octocat',
      'https://api.github.com',
      'test-access',
      [],
      '',
      1,
      'Octocat'
    )
    await accountsStore.addAccount(account, {
      accessToken: account.token,
      refreshToken: 'test-refresh',
      expiresAt: now + 8 * 60 * 60_000,
    })
    const [current] = await accountsStore.getAll()
    assert.ok(current)
    const getter = accountsStore.createTokenGetter(current, 0)
    let updates = 0
    const subscription = accountsStore.onDidUpdate(() => {
      updates++
    })
    t.after(() => subscription.dispose())

    await accountsStore.setTokenExpirationForTesting(current, now + 5 * 60_000)
    assert.equal((await getter()).expiresAt, now + 5 * 60_000)
    assert.equal(
      (await accountsStore.getTokenExpirationForTesting(current)).isOverridden,
      true
    )
    await accountsStore.setTokenExpirationForTesting(current, undefined)
    assert.equal((await getter()).expiresAt, now + 8 * 60 * 60_000)
    assert.equal(updates, 0)
    assert.equal((await accountsStore.getAll())[0], current)
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

  describe('persisted identities', () => {
    const persisted = (login: string, endpoint: string) => ({
      login,
      endpoint,
      token: '',
      emails: [],
      avatarURL: '',
      id: 1,
      name: '',
    })

    it('includes accounts whose credentials could not be read', async () => {
      const dataStore = new InMemoryStore()
      dataStore.setItem(
        'users',
        JSON.stringify([
          persisted('alice', 'https://api.github.com'),
          persisted('bob', 'https://enterprise.example.com/api/v3'),
        ])
      )
      const secureStore = new AsyncInMemoryStore()
      secureStore.getItem = async (key: string, login?: string) => {
        if (login === 'bob') {
          throw new Error('The keychain is locked')
        }
        return login === 'alice' ? 'alice-token' : null
      }
      const store = new AccountsStore(dataStore, secureStore)
      store.onDidError(() => {})

      assert.deepStrictEqual(
        (await store.getAll()).map(a => a.login),
        ['alice']
      )
      assert.deepStrictEqual(await store.getPersistedIdentities(), [
        { endpoint: 'https://api.github.com', login: 'alice' },
        { endpoint: 'https://enterprise.example.com/api/v3', login: 'bob' },
      ])
    })

    it('includes accounts whose stored credentials were unusable', async () => {
      const dataStore = new InMemoryStore()
      dataStore.setItem(
        'users',
        JSON.stringify([persisted('alice', 'https://api.github.com')])
      )
      const secureStore = new AsyncInMemoryStore()
      secureStore.getItem = async () => 'github-desktop-oauth:not json'
      const store = new AccountsStore(dataStore, secureStore)
      store.onDidError(() => {})

      assert.deepStrictEqual(await store.getAll(), [])
      assert.deepStrictEqual(await store.getPersistedIdentities(), [
        { endpoint: 'https://api.github.com', login: 'alice' },
      ])
    })

    it('uses migrated endpoints', async () => {
      const dataStore = new InMemoryStore()
      dataStore.setItem(
        'users',
        JSON.stringify([persisted('joan', 'https://whatever.ghe.com/api/v3')])
      )
      const store = new AccountsStore(dataStore, new AsyncInMemoryStore())
      assert.deepStrictEqual(await store.getPersistedIdentities(), [
        { endpoint: 'https://api.whatever.ghe.com/', login: 'joan' },
      ])
    })
  })
})
