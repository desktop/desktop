import * as copilotSdk from '@github/copilot-sdk'
import type { CopilotClientOptions } from '@github/copilot-sdk'
import assert from 'node:assert/strict'
import {
  after,
  before,
  beforeEach,
  describe,
  it,
  mock,
  TestContext,
} from 'node:test'
import { AccountsStore } from '../../../src/lib/stores/accounts-store'
import { AccountRequiresSignInError } from '../../../src/lib/credential-sessions'
import type {
  CopilotModelRequest,
  CopilotStore,
} from '../../../src/lib/stores/copilot-store'
import type { IOAuthToken } from '../../../src/lib/oauth-token'
import { Account } from '../../../src/models/account'
import { AsyncInMemoryStore, InMemoryStore } from '../../helpers/stores'

const now = 1_800_000_000_000
const account = new Account(
  'octocat',
  'https://api.github.com',
  'old-access',
  [],
  '',
  1,
  'Octocat'
)
const clientOptions: CopilotClientOptions[] = []
let createStore: (accountsStore: AccountsStore) => CopilotStore
let runtimePathExists: () => Promise<boolean> = async () => true

function enablePreviewFeatures(t: TestContext) {
  const previousPreview = process.env.GITHUB_DESKTOP_PREVIEW_FEATURES
  process.env.GITHUB_DESKTOP_PREVIEW_FEATURES = '1'
  t.after(() => {
    if (previousPreview === undefined) {
      delete process.env.GITHUB_DESKTOP_PREVIEW_FEATURES
    } else {
      process.env.GITHUB_DESKTOP_PREVIEW_FEATURES = previousPreview
    }
  })
}

async function setup(t: TestContext, credential: IOAuthToken) {
  let renewals = 0
  const accountsStore = new AccountsStore(
    new InMemoryStore(),
    new AsyncInMemoryStore(),
    async () => {
      renewals++
      return {
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        expiresAt: Date.now() + 8 * 60 * 60 * 1000,
      }
    }
  )
  await accountsStore.addAccount(account, credential)
  const store = createStore(accountsStore)
  const sessionCreationStopped = new Error('Session configuration captured')
  const createSession = t.mock.method(
    copilotSdk.CopilotClient.prototype,
    'createSession',
    async () => {
      throw sessionCreationStopped
    }
  )
  const stop = t.mock.method(
    copilotSdk.CopilotClient.prototype,
    'stop',
    async () => []
  )
  // Bypass model discovery, not production client or session creation.
  const generate = (
    original = account,
    request: CopilotModelRequest = {
      kind: 'byok',
      modelId: 'test-model',
      provider: { type: 'openai', baseUrl: 'https://example.com' },
    }
  ) =>
    store.generateCommitMessage(
      original,
      'diff --git a/file b/file',
      '/repository',
      request
    )

  return {
    accountsStore,
    store,
    createSession,
    generate,
    sessionCreationStopped,
    stop,
    renewals: () => renewals,
  }
}

describe('CopilotStore session credential wiring', () => {
  before(async () => {
    mock.module('@github/copilot-sdk', {
      namedExports: {
        ...copilotSdk,
        CopilotClient: function (options: CopilotClientOptions) {
          clientOptions.push(options)
          return new copilotSdk.CopilotClient(options)
        },
      },
    })
    mock.module('../../../src/lib/path-exists', {
      namedExports: { pathExists: () => runtimePathExists() },
    })
    const { CopilotStore } = await import(
      '../../../src/lib/stores/copilot-store'
    )
    createStore = accountsStore => new CopilotStore(accountsStore)
  })

  beforeEach(() => {
    clientOptions.length = 0
    runtimePathExists = async () => true
  })

  after(() => mock.restoreAll())

  it('passes an invokable, rotating token provider to the SDK session', async t => {
    let clock = now
    t.mock.method(Date, 'now', () => clock)
    const { createSession, generate, sessionCreationStopped, stop, renewals } =
      await setup(t, {
        accessToken: account.token,
        refreshToken: 'old-refresh',
        expiresAt: now + 2 * 60 * 60 * 1000,
      })

    await assert.rejects(generate(), sessionCreationStopped)
    assert.equal(clientOptions.length, 1)
    assert.equal(clientOptions[0].gitHubToken, account.token)
    assert.equal(createSession.mock.callCount(), 1)
    assert.equal(stop.mock.callCount(), 1)
    const config = createSession.mock.calls[0].arguments[0]
    assert.ok(config)
    assert.equal(config.gitHubToken, undefined)
    const provider = config.gitHubTokenProvider
    assert.ok(provider)

    const initial = await provider({ host: 'github.com', reason: 'initial' })
    assert.ok(initial.kind === 'token')
    assert.equal(initial.accessToken, account.token)
    assert.equal(initial.expiresIn, 2 * 60 * 60 - 60)
    assert.equal('refreshToken' in initial, false)

    clock += 60 * 60 * 1000
    const refreshed = await provider({ host: 'github.com', reason: 'refresh' })
    assert.ok(refreshed.kind === 'token')
    assert.equal(refreshed.accessToken, 'new-access')
    assert.equal(refreshed.expiresIn, 8 * 60 * 60 - 60)
    assert.equal('refreshToken' in refreshed, false)
    assert.equal(renewals(), 1)
  })

  it('keeps static client authentication and omits the provider for legacy tokens', async t => {
    const { createSession, generate, sessionCreationStopped, renewals } =
      await setup(t, { accessToken: account.token })

    await assert.rejects(generate(), sessionCreationStopped)
    assert.equal(clientOptions.length, 1)
    assert.equal(clientOptions[0].gitHubToken, account.token)
    assert.equal(createSession.mock.callCount(), 1)
    const config = createSession.mock.calls[0].arguments[0]
    assert.ok(config)
    assert.equal(config.gitHubTokenProvider, undefined)
    assert.equal(config.gitHubToken, undefined)
    assert.equal(renewals(), 0)
  })

  for (const refreshable of [false, true]) {
    it(`rejects a pending ${
      refreshable ? 'refreshable' : 'legacy'
    } client when sign-in reuses its token`, async t => {
      t.mock.method(Date, 'now', () => now)
      const {
        accountsStore,
        createSession,
        generate,
        sessionCreationStopped,
        renewals,
      } = await setup(
        t,
        refreshable
          ? {
              accessToken: account.token,
              refreshToken: 'old-refresh',
              expiresAt: now + 2 * 60 * 60 * 1000,
            }
          : { accessToken: account.token }
      )
      runtimePathExists = async () => {
        await accountsStore.removeAccount(account)
        await accountsStore.addAccount(account, {
          accessToken: account.token,
          refreshToken: 'replacement-refresh',
          expiresAt: now + 8 * 60 * 60 * 1000,
        })
        return true
      }

      await assert.rejects(generate(), AccountRequiresSignInError)
      assert.equal(clientOptions.length, 0)
      assert.equal(createSession.mock.callCount(), 0)
      assert.equal(renewals(), 0)

      runtimePathExists = async () => true
      const [current] = await accountsStore.getAll()
      assert.ok(current)
      await assert.rejects(generate(current), sessionCreationStopped)
      assert.equal(createSession.mock.callCount(), 1)
      const newProvider =
        createSession.mock.calls[0].arguments[0]?.gitHubTokenProvider
      assert.ok(newProvider)
      const result = await newProvider({
        host: 'github.com',
        reason: 'initial',
      })
      assert.ok(result.kind === 'token')
      assert.equal(result.accessToken, account.token)
    })
  }

  it('keeps the ordinary refresh margin for model metadata clients', async t => {
    enablePreviewFeatures(t)
    t.mock.method(Date, 'now', () => now)
    const { store, createSession, stop, renewals } = await setup(t, {
      accessToken: account.token,
      refreshToken: 'old-refresh',
      expiresAt: now + 45 * 60 * 1000,
    })
    await new Promise(resolve => setImmediate(resolve))
    t.mock.method(copilotSdk.CopilotClient.prototype, 'start', async () => {})
    t.mock.method(
      copilotSdk.CopilotClient.prototype,
      'listModels',
      async () => []
    )

    assert.deepEqual(await store.listModels(account), [])
    assert.equal(clientOptions.length, 1)
    assert.equal(clientOptions[0].gitHubToken, account.token)
    assert.equal(createSession.mock.callCount(), 0)
    assert.equal(stop.mock.callCount(), 1)
    assert.equal(renewals(), 0)
  })

  it('rejects sign-in replacement while built-in model discovery is pending', async t => {
    enablePreviewFeatures(t)
    t.mock.method(Date, 'now', () => now)
    const { accountsStore, store, createSession, generate, renewals } =
      await setup(t, {
        accessToken: account.token,
        refreshToken: 'old-refresh',
        expiresAt: now + 2 * 60 * 60 * 1000,
      })
    const [original] = await accountsStore.getAll()
    assert.ok(original)
    await new Promise(resolve => setImmediate(resolve))
    const tokenGetters = t.mock.method(accountsStore, 'createTokenGetter')
    const listModels = store.listModels.bind(store)
    let gettersBeforeDiscovery = 0
    t.mock.method(store, 'listModels', async (original: Account) => {
      gettersBeforeDiscovery = tokenGetters.mock.callCount()
      return listModels(original)
    })
    t.mock.method(copilotSdk.CopilotClient.prototype, 'start', async () => {})
    const discovery = t.mock.method(
      copilotSdk.CopilotClient.prototype,
      'listModels',
      async () => {
        await accountsStore.removeAccount(original)
        await accountsStore.addAccount(original, {
          accessToken: original.token,
          refreshToken: 'replacement-refresh',
          expiresAt: now + 45 * 60 * 1000,
        })
        return []
      }
    )

    await assert.rejects(
      generate(original, { kind: 'copilot', modelId: 'auto' }),
      AccountRequiresSignInError
    )
    assert.equal(gettersBeforeDiscovery, 2)
    assert.equal(discovery.mock.callCount(), 1)
    assert.equal(createSession.mock.callCount(), 0)
    assert.equal(clientOptions.length, 1)
    assert.equal(renewals(), 0)
  })
})
