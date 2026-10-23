import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { Account } from '../../src/models/account'
import { AccountsStore } from '../../src/lib/stores'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'
import { getKeyForEndpoint } from '../../src/lib/auth'
import { TokenRefreshEvent } from '../../src/lib/credential-sessions'
import { OAuthRefreshRejectedError } from '../../src/lib/oauth-token'
import { serializeAccountCredential } from '../../src/lib/account-credential'

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

    it('moves refreshable credentials intact', async () => {
      const dataStore = new InMemoryStore()
      dataStore.setItem(
        'users',
        JSON.stringify([persistedUser('https://api.whatever.ghe.com/')])
      )
      const secureStore = new AsyncInMemoryStore()
      const legacyKey = getKeyForEndpoint('https://api.whatever.ghe.com/')
      const serialized = serializeAccountCredential({
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: Date.now() + 8 * 60 * 60 * 1000,
        refreshTokenExpiresAt: Date.now() + 180 * 24 * 60 * 60 * 1000,
      })
      await secureStore.setItem(legacyKey, 'joan', serialized)

      accountsStore = new AccountsStore(dataStore, secureStore)

      const users = await accountsStore.getAll()
      assert.equal(users[0].endpoint, canonicalEndpoint)
      assert.equal(users[0].token, 'access')
      assert.equal(accountsStore.isRefreshable(users[0]), true)
      assert.equal(
        await secureStore.getItem(getKeyForEndpoint(canonicalEndpoint), 'joan'),
        serialized
      )
      assert.equal(await secureStore.getItem(legacyKey, 'joan'), null)
    })

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
