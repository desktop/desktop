import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { Account, IAccountMetadata } from '../../src/models/account'
import { getDotComAPIEndpoint } from '../../src/lib/api'
import { getKeyForAccount } from '../../src/lib/auth'
import { AccountsStore } from '../../src/lib/stores'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'

function createAccount(
  login: string,
  endpoint: string,
  id: number,
  token = `${login}-token`
) {
  return new Account(login, endpoint, token, [], '', id, login, 'free')
}

class PausedDeleteStore extends AsyncInMemoryStore {
  private resumeDelete: (() => void) | undefined
  private signalDeleteStarted: (() => void) | undefined
  public readonly deleteStarted = new Promise<void>(
    resolve => (this.signalDeleteStarted = resolve)
  )
  private readonly deleteGate = new Promise<void>(
    resolve => (this.resumeDelete = resolve)
  )

  public releaseDelete() {
    this.resumeDelete?.()
  }

  public override async deleteItem(
    key: string,
    login: string
  ): Promise<boolean> {
    this.signalDeleteStarted?.()
    await this.deleteGate
    return super.deleteItem(key, login)
  }
}

class PausedSetStore extends AsyncInMemoryStore {
  private resumeSet: (() => void) | undefined
  private signalSetStarted: (() => void) | undefined
  public readonly setStarted = new Promise<void>(
    resolve => (this.signalSetStarted = resolve)
  )
  private readonly setGate = new Promise<void>(
    resolve => (this.resumeSet = resolve)
  )
  public setCalls = 0

  public releaseSet() {
    this.resumeSet?.()
  }

  public override async setItem(
    key: string,
    login: string,
    value: string
  ): Promise<void> {
    this.setCalls++
    this.signalSetStarted?.()
    await this.setGate
    return super.setItem(key, login, value)
  }
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
      await accountsStore.addAccount(
        new Account(newAccountLogin, '', 'deadbeef', [], '', 1, '', 'free')
      )

      const users = await accountsStore.getAll()
      assert.equal(users[0].login, newAccountLogin)
    })

    it('stores multiple accounts for one endpoint but exposes only the active account', async () => {
      const endpoint = getDotComAPIEndpoint()

      await accountsStore.addAccount(createAccount('mona', endpoint, 1))
      await accountsStore.addAccount(createAccount('hubot', endpoint, 2))

      const activeAccounts = await accountsStore.getAll()
      const allAccounts = await accountsStore.getAllAccounts()

      assert.deepEqual(
        activeAccounts.map(account => account.login),
        ['hubot']
      )
      assert.deepEqual(
        allAccounts.map(account => account.login),
        ['hubot', 'mona']
      )
      assert.equal(
        allAccounts.some(account => 'token' in account),
        false
      )
    })

    it('updates and activates an account without duplicating it', async () => {
      const endpoint = getDotComAPIEndpoint()

      await accountsStore.addAccount(
        createAccount('mona', endpoint, 1, 'old-token')
      )
      await accountsStore.addAccount(createAccount('hubot', endpoint, 2))
      await accountsStore.addAccount(
        createAccount('mona', endpoint, 1, 'new-token')
      )

      const allAccounts = await accountsStore.getAllAccounts()

      assert.deepEqual(
        allAccounts.map(account => account.login),
        ['mona', 'hubot']
      )
      assert.equal((await accountsStore.getAll())[0].token, 'new-token')
      assert.equal(
        allAccounts.some(account => 'token' in account),
        false
      )
    })

    it("removes the credential stored under an account's previous login", async () => {
      const endpoint = getDotComAPIEndpoint()
      const dataStore = new InMemoryStore()
      const secureStore = new AsyncInMemoryStore()
      accountsStore = new AccountsStore(dataStore, secureStore)
      const previousAccount = createAccount(
        'previous-login',
        endpoint,
        1,
        'old-token'
      )
      const renamedAccount = createAccount(
        'renamed-login',
        endpoint,
        1,
        'new-token'
      )

      await accountsStore.addAccount(previousAccount)
      await accountsStore.addAccount(renamedAccount)

      const key = getKeyForAccount(renamedAccount)
      assert.equal(await secureStore.getItem(key, previousAccount.login), null)
      assert.equal(
        await secureStore.getItem(key, renamedAccount.login),
        'new-token'
      )
      assert.deepEqual(
        (await accountsStore.getAllAccounts()).map(account => account.login),
        ['renamed-login']
      )
    })

    it('does not let two identities share one credential', async () => {
      const endpoint = 'https://github.example.com/api/v3'
      const dataStore = new InMemoryStore()
      const secureStore = new PausedSetStore()
      accountsStore = new AccountsStore(dataStore, secureStore)
      const originalAccount = createAccount(
        'reused-login',
        endpoint,
        1,
        'original-token'
      )
      const differentIdentity = createAccount(
        'reused-login',
        endpoint,
        2,
        'replacement-token'
      )
      let emittedError: Error | null = null
      accountsStore.onDidError(error => (emittedError = error))

      const originalAddition = accountsStore.addAccount(originalAccount)
      await secureStore.setStarted
      const conflictingAddition = accountsStore.addAccount(differentIdentity)
      await new Promise<void>(resolve => setImmediate(resolve))

      assert.equal(secureStore.setCalls, 1)
      secureStore.releaseSet()
      assert.equal(await originalAddition, originalAccount)
      assert.equal(await conflictingAddition, null)

      assert.match(emittedError?.message ?? '', /already has another/)
      assert.deepEqual(
        (await accountsStore.getAllAccounts()).map(account => account.id),
        [originalAccount.id]
      )

      const reloadedStore = new AccountsStore(dataStore, secureStore)
      assert.deepEqual(
        (await reloadedStore.getAll()).map(account => [
          account.id,
          account.token,
        ]),
        [[originalAccount.id, originalAccount.token]]
      )
    })

    it('emits active and stored account updates separately', async () => {
      const endpoint = getDotComAPIEndpoint()
      const activeUpdates = new Array<ReadonlyArray<Account>>()
      const allAccountUpdates = new Array<ReadonlyArray<IAccountMetadata>>()

      accountsStore.onDidUpdate(accounts => activeUpdates.push(accounts))
      accountsStore.onDidUpdateAllAccounts(accounts =>
        allAccountUpdates.push(accounts)
      )

      await accountsStore.addAccount(createAccount('mona', endpoint, 1))
      await accountsStore.addAccount(createAccount('hubot', endpoint, 2))

      assert.deepEqual(
        activeUpdates.at(-1)?.map(account => account.login),
        ['hubot']
      )
      assert.deepEqual(
        allAccountUpdates.at(-1)?.map(account => account.login),
        ['hubot', 'mona']
      )
      assert.equal(
        allAccountUpdates.at(-1)?.some(account => 'token' in account),
        false
      )
    })
  })

  describe('switching accounts', () => {
    it('changes the active account for an endpoint', async () => {
      const endpoint = getDotComAPIEndpoint()
      const mona = createAccount('mona', endpoint, 1)
      const hubot = createAccount('hubot', endpoint, 2)

      await accountsStore.addAccount(mona)
      await accountsStore.addAccount(hubot)
      const activeAccount = await accountsStore.setActiveAccount(mona)

      assert.equal(activeAccount?.login, 'mona')
      assert.deepEqual(
        (await accountsStore.getAll()).map(account => account.login),
        ['mona']
      )
      assert.deepEqual(
        (await accountsStore.getAllAccounts()).map(account => account.login),
        ['mona', 'hubot']
      )
    })

    it('keeps one active account for every endpoint', async () => {
      const dotComEndpoint = getDotComAPIEndpoint()
      const enterpriseEndpoint = 'https://github.example.com/api/v3'

      await accountsStore.addAccount(
        createAccount('enterprise-one', enterpriseEndpoint, 1)
      )
      await accountsStore.addAccount(
        createAccount('dotcom-one', dotComEndpoint, 2)
      )
      await accountsStore.addAccount(
        createAccount('enterprise-two', enterpriseEndpoint, 3)
      )

      assert.deepEqual(
        (await accountsStore.getAll()).map(account => account.login),
        ['dotcom-one', 'enterprise-two']
      )
    })

    it('isolates same-login identities and tokens across GitHub hosts', async () => {
      const dataStore = new InMemoryStore()
      const secureStore = new AsyncInMemoryStore()
      const dotComEndpoint = getDotComAPIEndpoint()
      const enterpriseEndpoint = 'https://github.example.com/api/v3'
      accountsStore = new AccountsStore(dataStore, secureStore)

      await accountsStore.addAccount(
        createAccount('mona', dotComEndpoint, 1, 'dotcom-token')
      )
      await accountsStore.addAccount(
        createAccount('mona', enterpriseEndpoint, 1, 'enterprise-token')
      )

      const reloadedStore = new AccountsStore(dataStore, secureStore)
      assert.deepEqual(
        (await reloadedStore.getAll()).map(account => [
          account.endpoint,
          account.token,
        ]),
        [
          [dotComEndpoint, 'dotcom-token'],
          [enterpriseEndpoint, 'enterprise-token'],
        ]
      )

      await reloadedStore.removeAccountForToken(dotComEndpoint, 'dotcom-token')
      assert.deepEqual(
        (await reloadedStore.getAll()).map(account => [
          account.endpoint,
          account.token,
        ]),
        [[enterpriseEndpoint, 'enterprise-token']]
      )
    })

    it('falls back to another account when the active account is removed', async () => {
      const endpoint = getDotComAPIEndpoint()
      const mona = createAccount('mona', endpoint, 1)
      const hubot = createAccount('hubot', endpoint, 2)

      await accountsStore.addAccount(mona)
      await accountsStore.addAccount(hubot)
      await accountsStore.removeAccount(hubot)

      assert.deepEqual(
        (await accountsStore.getAll()).map(account => account.login),
        ['mona']
      )
    })

    it('persists account tokens and the active account independently', async () => {
      const dataStore = new InMemoryStore()
      const secureStore = new AsyncInMemoryStore()
      const endpoint = getDotComAPIEndpoint()
      const mona = createAccount('mona', endpoint, 1)
      const hubot = createAccount('hubot', endpoint, 2)
      accountsStore = new AccountsStore(dataStore, secureStore)

      await accountsStore.addAccount(mona)
      await accountsStore.addAccount(hubot)
      await accountsStore.setActiveAccount(mona)

      const reloadedStore = new AccountsStore(dataStore, secureStore)
      const reloadedAccounts = await reloadedStore.getAllAccounts()

      assert.deepEqual(
        reloadedAccounts.map(account => account.login),
        ['mona', 'hubot']
      )
      assert.equal(
        reloadedAccounts.some(account => 'token' in account),
        false
      )
      assert.deepEqual(
        (await reloadedStore.getAll()).map(account => [
          account.login,
          account.token,
        ]),
        [['mona', 'mona-token']]
      )

      await reloadedStore.setActiveAccount(reloadedAccounts[1])
      assert.deepEqual(
        (await reloadedStore.getAll()).map(account => [
          account.login,
          account.token,
        ]),
        [['hubot', 'hubot-token']]
      )
    })

    it('resolves tokenless metadata to the canonical account when removing it', async () => {
      const endpoint = getDotComAPIEndpoint()
      const mona = createAccount('mona', endpoint, 1)
      const hubot = createAccount('hubot', endpoint, 2)

      await accountsStore.addAccount(mona)
      await accountsStore.addAccount(hubot)
      const monaMetadata = (await accountsStore.getAllAccounts()).find(
        account => account.id === mona.id
      )

      assert.notEqual(monaMetadata, undefined)
      const removedAccount = await accountsStore.removeAccount(monaMetadata!)

      assert.equal(removedAccount?.token, 'mona-token')
      assert.deepEqual(
        (await accountsStore.getAllAccounts()).map(account => account.login),
        ['hubot']
      )
      assert.equal((await accountsStore.getAll())[0].token, 'hubot-token')
    })

    it('removes only the account owning an invalidated endpoint and token', async () => {
      const endpoint = getDotComAPIEndpoint()
      await accountsStore.addAccount(createAccount('mona', endpoint, 1))
      await accountsStore.addAccount(createAccount('hubot', endpoint, 2))

      assert.equal(
        await accountsStore.removeAccountForToken(endpoint, 'wrong-token'),
        null
      )

      const removedAccount = await accountsStore.removeAccountForToken(
        endpoint,
        'mona-token'
      )

      assert.equal(removedAccount?.login, 'mona')
      assert.deepEqual(
        (await accountsStore.getAllAccounts()).map(account => account.login),
        ['hubot']
      )
      assert.equal((await accountsStore.getAll())[0].token, 'hubot-token')
    })

    it('does not restore account order or removed accounts after a refresh', async () => {
      const endpoint = getDotComAPIEndpoint()
      const refreshResolvers = new Array<() => void>()
      let signalRefreshStarted: (() => void) | undefined
      const refreshStarted = new Promise<void>(
        resolve => (signalRefreshStarted = resolve)
      )
      accountsStore = new AccountsStore(
        new InMemoryStore(),
        new AsyncInMemoryStore(),
        account =>
          new Promise(resolve => {
            refreshResolvers.push(() => resolve(account))
            if (refreshResolvers.length === 2) {
              signalRefreshStarted?.()
            }
          })
      )
      const mona = createAccount('mona', endpoint, 1)
      const hubot = createAccount('hubot', endpoint, 2)

      await accountsStore.addAccount(mona)
      await accountsStore.addAccount(hubot)
      const refresh = accountsStore.refresh()
      await refreshStarted
      await accountsStore.setActiveAccount(mona)
      await accountsStore.removeAccount(hubot)
      refreshResolvers.forEach(resolve => resolve())
      await refresh

      assert.deepEqual(
        (await accountsStore.getAllAccounts()).map(account => account.login),
        ['mona']
      )
      assert.equal((await accountsStore.getAll())[0].token, 'mona-token')
    })

    it('does not let a pending removal erase a reauthenticated account', async () => {
      const endpoint = getDotComAPIEndpoint()
      const secureStore = new PausedDeleteStore()
      accountsStore = new AccountsStore(new InMemoryStore(), secureStore)
      const oldAccount = createAccount('mona', endpoint, 1, 'old-token')
      const reauthenticatedAccount = createAccount(
        'mona',
        endpoint,
        1,
        'new-token'
      )

      await accountsStore.addAccount(oldAccount)
      const removal = accountsStore.removeAccountForToken(endpoint, 'old-token')
      await secureStore.deleteStarted

      let reauthenticationFinished = false
      const reauthentication = accountsStore
        .addAccount(reauthenticatedAccount)
        .then(account => {
          reauthenticationFinished = true
          return account
        })
      await Promise.resolve()
      assert.equal(reauthenticationFinished, false)

      secureStore.releaseDelete()
      await removal
      await reauthentication

      assert.deepEqual(
        (await accountsStore.getAll()).map(account => [
          account.login,
          account.token,
        ]),
        [['mona', 'new-token']]
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
