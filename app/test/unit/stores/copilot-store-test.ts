import type { CopilotClient, CopilotSession } from '@github/copilot-sdk'
import type { Model } from '@github/copilot-sdk/dist/generated/rpc'
import assert from 'node:assert'
import { after, before, describe, it } from 'node:test'
import { getDotComAPIEndpoint } from '../../../src/lib/api'
import { AccountsStore } from '../../../src/lib/stores/accounts-store'
import {
  CommitMessageGenerationCancelledError,
  CopilotConflictResolutionAbortError,
  type CopilotModelRequest,
  CopilotStore,
  DefaultCopilotModel,
  getCopilotGHHost,
  getCopilotModelCacheKey,
  getLowestReasoningEffort,
  getPreferredDefaultModel,
  getSupportedReasoningEffort,
  isCopilotConflictResolutionAbortError,
  runConflictResolutionTurn,
} from '../../../src/lib/stores/copilot-store'
import { Account } from '../../../src/models/account'
import { AsyncInMemoryStore, InMemoryStore } from '../../helpers/stores'

const PreviewFeaturesEnv = 'GITHUB_DESKTOP_PREVIEW_FEATURES'

interface IAccountOverrides {
  readonly login?: string
  readonly endpoint?: string
  readonly token?: string
  readonly id?: number
  readonly name?: string
}

interface ITestCopilotClient {
  start(): Promise<void>
  listModels(): Promise<ReadonlyArray<Model>>
  stop(): Promise<void>
}

interface ITestableCopilotStore {
  createClient(account: Account): Promise<ITestCopilotClient>
}

interface ITestableCommitMessageCopilotStore {
  createClient(
    account: Account,
    repositoryPath?: string
  ): Promise<CopilotClient>
}

function makeAccount(overrides: IAccountOverrides = {}): Account {
  const login = overrides.login ?? 'monalisa'

  return new Account(
    login,
    overrides.endpoint ?? getDotComAPIEndpoint(),
    overrides.token ?? 'token',
    [],
    '',
    overrides.id ?? 1,
    overrides.name ?? login,
    'free'
  )
}

function createAccountsStore(): AccountsStore {
  return new AccountsStore(new InMemoryStore(), new AsyncInMemoryStore())
}

function createDeferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
} {
  let resolveValue: ((value: T) => void) | null = null
  const promise = new Promise<T>(resolve => {
    resolveValue = resolve
  })

  if (resolveValue === null) {
    throw new Error('Deferred promise resolver was not initialized')
  }

  return { promise, resolve: resolveValue }
}

function createCopilotStoreWithModels(
  getModels: (
    account: Account
  ) => ReadonlyArray<Model> | Promise<ReadonlyArray<Model>>
): {
  readonly accountsStore: AccountsStore
  readonly store: CopilotStore
  readonly createClientAccounts: ReadonlyArray<Account>
  readonly stopCount: () => number
} {
  const accountsStore = createAccountsStore()
  const store = new CopilotStore(accountsStore)
  const createClientAccounts: Array<Account> = []
  let stopCount = 0
  const testableStore = store as unknown as ITestableCopilotStore

  testableStore.createClient = async account => {
    createClientAccounts.push(account)

    return {
      start: async () => {},
      listModels: async () => getModels(account),
      stop: async () => {
        stopCount++
      },
    }
  }

  return {
    accountsStore,
    store,
    createClientAccounts,
    stopCount: () => stopCount,
  }
}

function makeModel(
  overrides: Partial<Model> & Pick<Model, 'id' | 'name'>
): Model {
  return {
    capabilities: {
      supports: { vision: false, reasoningEffort: false },
      limits: { max_context_window_tokens: 128000 },
    },
    ...overrides,
  }
}

function createBYOKRequest(): CopilotModelRequest {
  return {
    kind: 'byok',
    modelId: 'test-model',
    provider: {
      type: 'openai',
      baseUrl: 'https://example.com',
    },
  }
}

function assertCommitMessageGenerationCancelled(error: unknown): boolean {
  assert.ok(error instanceof CommitMessageGenerationCancelledError)
  return true
}

describe('getCopilotModelCacheKey', () => {
  it('uses account id and endpoint', () => {
    const account = makeAccount({
      id: 42,
      endpoint: 'https://api.github.example.com',
    })

    assert.strictEqual(
      getCopilotModelCacheKey(account),
      '42:https://api.github.example.com'
    )
  })

  it('differs when account id or endpoint differs', () => {
    const account = makeAccount({ id: 1 })
    const sameEndpointDifferentId = makeAccount({ id: 2 })
    const sameIdDifferentEndpoint = makeAccount({
      id: 1,
      endpoint: 'https://api.github.example.com',
    })

    assert.notStrictEqual(
      getCopilotModelCacheKey(account),
      getCopilotModelCacheKey(sameEndpointDifferentId)
    )
    assert.notStrictEqual(
      getCopilotModelCacheKey(account),
      getCopilotModelCacheKey(sameIdDifferentEndpoint)
    )
  })
})

describe('getCopilotGHHost', () => {
  it('returns undefined for GitHub.com accounts', () => {
    assert.strictEqual(getCopilotGHHost(makeAccount()), undefined)
  })

  it('returns the endpoint host for Enterprise accounts', () => {
    const account = makeAccount({
      endpoint: 'https://github.example.com:8443/api/v3',
    })

    assert.strictEqual(getCopilotGHHost(account), 'github.example.com:8443')
  })
})

describe('CopilotStore model cache', () => {
  let previousPreviewFeatures: string | undefined

  before(() => {
    previousPreviewFeatures = process.env[PreviewFeaturesEnv]
    process.env[PreviewFeaturesEnv] = '1'
  })

  after(() => {
    if (previousPreviewFeatures === undefined) {
      delete process.env[PreviewFeaturesEnv]
    } else {
      process.env[PreviewFeaturesEnv] = previousPreviewFeatures
    }
  })

  it('reuses cached models for the same account', async () => {
    const account = makeAccount()
    const models = [makeModel({ id: 'model-a', name: 'Model A' })]
    const { accountsStore, store, createClientAccounts, stopCount } =
      createCopilotStoreWithModels(() => models)

    await accountsStore.addAccount(account)

    assert.strictEqual(await store.listModels(account), models)
    assert.strictEqual(store.getCachedModelList(account), models)
    assert.strictEqual(await store.listModels(account), models)
    assert.strictEqual(createClientAccounts.length, 1)
    assert.strictEqual(stopCount(), 1)
  })

  it('keeps separate model caches for different accounts', async () => {
    const dotComAccount = makeAccount({ id: 1, login: 'dotcom' })
    const enterpriseAccount = makeAccount({
      id: 1,
      login: 'enterprise',
      endpoint: 'https://github.example.com/api/v3',
    })
    const dotComModels = [makeModel({ id: 'dotcom', name: 'Dotcom' })]
    const enterpriseModels = [
      makeModel({ id: 'enterprise', name: 'Enterprise' }),
    ]
    const { accountsStore, store, createClientAccounts } =
      createCopilotStoreWithModels(account =>
        account.endpoint === dotComAccount.endpoint
          ? dotComModels
          : enterpriseModels
      )

    await accountsStore.addAccount(dotComAccount)
    await accountsStore.addAccount(enterpriseAccount)

    assert.strictEqual(await store.listModels(dotComAccount), dotComModels)
    assert.strictEqual(
      await store.listModels(enterpriseAccount),
      enterpriseModels
    )
    assert.strictEqual(store.getCachedModelList(dotComAccount), dotComModels)
    assert.strictEqual(
      store.getCachedModelList(enterpriseAccount),
      enterpriseModels
    )
    assert.strictEqual(createClientAccounts.length, 2)
  })

  it('deduplicates concurrent fetches for the same account', async () => {
    const account = makeAccount()
    const models = [makeModel({ id: 'model-a', name: 'Model A' })]
    const deferred = createDeferred<ReadonlyArray<Model>>()
    const { accountsStore, store, createClientAccounts } =
      createCopilotStoreWithModels(() => deferred.promise)

    await accountsStore.addAccount(account)

    const first = store.listModels(account)
    const second = store.listModels(account)

    assert.strictEqual(createClientAccounts.length, 1)

    deferred.resolve(models)

    assert.strictEqual(await first, models)
    assert.strictEqual(await second, models)
    assert.strictEqual(store.getCachedModelList(account), models)
  })

  it('clears cached models when the account is logged out', async () => {
    const account = makeAccount()
    const models = [makeModel({ id: 'model-a', name: 'Model A' })]
    const { accountsStore, store } = createCopilotStoreWithModels(() => models)

    await accountsStore.addAccount(account)
    assert.strictEqual(await store.listModels(account), models)
    assert.strictEqual(store.getCachedModelList(account), models)

    await accountsStore.removeAccount(account)

    assert.strictEqual(store.getCachedModelList(account), null)
    assert.strictEqual(await store.listModels(account), null)
  })

  it('does not restore cached models when an in-flight fetch resolves after logout', async () => {
    const account = makeAccount()
    const models = [makeModel({ id: 'model-a', name: 'Model A' })]
    const deferred = createDeferred<ReadonlyArray<Model>>()
    const { accountsStore, store } = createCopilotStoreWithModels(
      () => deferred.promise
    )

    await accountsStore.addAccount(account)
    const fetch = store.listModels(account)

    await accountsStore.removeAccount(account)
    deferred.resolve(models)

    assert.strictEqual(await fetch, models)
    assert.strictEqual(store.getCachedModelList(account), null)
    assert.strictEqual(await store.listModels(account), null)
  })

  it('does not restore stale models when the account signs back in before an old fetch resolves', async () => {
    const account = makeAccount()
    const staleModels = [makeModel({ id: 'stale', name: 'Stale' })]
    const freshModels = [makeModel({ id: 'fresh', name: 'Fresh' })]
    const deferred = createDeferred<ReadonlyArray<Model>>()
    let fetchCount = 0
    const { accountsStore, store } = createCopilotStoreWithModels(() => {
      fetchCount++
      return fetchCount === 1 ? deferred.promise : freshModels
    })

    await accountsStore.addAccount(account)
    const staleFetch = store.listModels(account)

    await accountsStore.removeAccount(account)
    await accountsStore.addAccount(account)
    deferred.resolve(staleModels)

    assert.strictEqual(await staleFetch, staleModels)
    assert.strictEqual(store.getCachedModelList(account), null)
    assert.strictEqual(await store.listModels(account), freshModels)
    assert.strictEqual(store.getCachedModelList(account), freshModels)
  })
})

describe('CopilotStore commit message generation cancellation', () => {
  let previousPreviewFeatures: string | undefined

  before(() => {
    previousPreviewFeatures = process.env[PreviewFeaturesEnv]
    process.env[PreviewFeaturesEnv] = '1'
  })

  after(() => {
    if (previousPreviewFeatures === undefined) {
      delete process.env[PreviewFeaturesEnv]
    } else {
      process.env[PreviewFeaturesEnv] = previousPreviewFeatures
    }
  })

  it('does not create a commit-message client after cancellation during model resolution', async () => {
    const account = makeAccount()
    const models = [makeModel({ id: DefaultCopilotModel, name: 'Default' })]
    const deferred = createDeferred<ReadonlyArray<Model>>()
    const { accountsStore, store, createClientAccounts } =
      createCopilotStoreWithModels(() => deferred.promise)

    await accountsStore.addAccount(account)

    const controller = new AbortController()
    const generation = store.generateCommitMessage(
      account,
      'diff --git a/file b/file',
      '/path/to/repository',
      null,
      [],
      controller.signal
    )

    controller.abort()
    deferred.resolve(models)

    await assert.rejects(generation, assertCommitMessageGenerationCancelled)

    assert.strictEqual(createClientAccounts.length, 1)
  })

  it('stops the client without creating a session after cancellation before session creation', async () => {
    const account = makeAccount()
    const accountsStore = createAccountsStore()
    const store = new CopilotStore(accountsStore)
    const controller = new AbortController()
    let createSessionCount = 0
    let stopCount = 0

    const client = {
      createSession: async () => {
        createSessionCount++
        throw new Error('Unexpected session creation')
      },
      stop: async () => {
        stopCount++
      },
    } as unknown as CopilotClient
    const testableStore = store as unknown as ITestableCommitMessageCopilotStore
    testableStore.createClient = async () => {
      controller.abort()
      return client
    }

    const generation = store.generateCommitMessage(
      account,
      'diff --git a/file b/file',
      '/path/to/repository',
      createBYOKRequest(),
      [],
      controller.signal
    )

    await assert.rejects(generation, assertCommitMessageGenerationCancelled)

    assert.strictEqual(createSessionCount, 0)
    assert.strictEqual(stopCount, 1)
  })

  it('stops the client after cancellation during session creation', async () => {
    const account = makeAccount()
    const repositoryPath = '/path/to/repository'
    const accountsStore = createAccountsStore()
    const store = new CopilotStore(accountsStore)
    const createSessionStarted = createDeferred<void>()
    const sessionCreation = createDeferred<CopilotSession>()
    const controller = new AbortController()
    let disconnectCount = 0
    let stopCount = 0

    const session = {
      disconnect: async () => {
        disconnectCount++
      },
    } as unknown as CopilotSession
    const client = {
      createSession: () => {
        createSessionStarted.resolve(undefined)
        return sessionCreation.promise
      },
      stop: async () => {
        stopCount++
      },
    } as unknown as CopilotClient
    const testableStore = store as unknown as ITestableCommitMessageCopilotStore
    testableStore.createClient = async () => client

    const generation = store.generateCommitMessage(
      account,
      'diff --git a/file b/file',
      repositoryPath,
      createBYOKRequest(),
      [],
      controller.signal
    )

    await createSessionStarted.promise
    controller.abort()

    await assert.rejects(generation, assertCommitMessageGenerationCancelled)
    assert.strictEqual(stopCount, 1)
    assert.strictEqual(disconnectCount, 0)

    sessionCreation.resolve(session)
    await Promise.resolve()

    assert.strictEqual(disconnectCount, 1)
  })

  it('disconnects the session and stops the client after cancellation during generation', async () => {
    const account = makeAccount()
    const repositoryPath = '/path/to/repository'
    const accountsStore = createAccountsStore()
    const store = new CopilotStore(accountsStore)
    const sendStarted = createDeferred<void>()
    const controller = new AbortController()
    let disconnectCount = 0
    let stopCount = 0

    const session = {
      on: () => () => {},
      sendAndWait: () => {
        sendStarted.resolve(undefined)
        return new Promise<never>(() => {})
      },
      disconnect: async () => {
        disconnectCount++
      },
    } as unknown as CopilotSession
    const client = {
      createSession: async () => session,
      stop: async () => {
        stopCount++
      },
    } as unknown as CopilotClient
    const testableStore = store as unknown as ITestableCommitMessageCopilotStore
    testableStore.createClient = async () => client

    const generation = store.generateCommitMessage(
      account,
      'diff --git a/file b/file',
      repositoryPath,
      createBYOKRequest(),
      [],
      controller.signal
    )

    await sendStarted.promise
    controller.abort()

    await assert.rejects(generation, assertCommitMessageGenerationCancelled)

    assert.strictEqual(disconnectCount, 1)
    assert.strictEqual(stopCount, 1)
  })
})

describe('getLowestReasoningEffort', () => {
  it('returns undefined when model has no supported reasoning efforts', () => {
    const model = makeModel({ id: 'a', name: 'A' })
    assert.strictEqual(getLowestReasoningEffort(model), undefined)
  })

  it('returns undefined when supportedReasoningEfforts is empty', () => {
    const model = makeModel({
      id: 'a',
      name: 'A',
      supportedReasoningEfforts: [],
    })
    assert.strictEqual(getLowestReasoningEffort(model), undefined)
  })

  it('returns low when it is the only supported effort', () => {
    const model = makeModel({
      id: 'a',
      name: 'A',
      supportedReasoningEfforts: ['low'],
    })
    assert.strictEqual(getLowestReasoningEffort(model), 'low')
  })

  it('returns low when multiple efforts are supported', () => {
    const model = makeModel({
      id: 'a',
      name: 'A',
      supportedReasoningEfforts: ['medium', 'high', 'low'],
    })
    assert.strictEqual(getLowestReasoningEffort(model), 'low')
  })

  it('returns medium when low is not supported', () => {
    const model = makeModel({
      id: 'a',
      name: 'A',
      supportedReasoningEfforts: ['high', 'medium'],
    })
    assert.strictEqual(getLowestReasoningEffort(model), 'medium')
  })

  it('returns xhigh when it is the only supported effort', () => {
    const model = makeModel({
      id: 'a',
      name: 'A',
      supportedReasoningEfforts: ['xhigh'],
    })
    assert.strictEqual(getLowestReasoningEffort(model), 'xhigh')
  })
})

describe('getSupportedReasoningEffort', () => {
  it('returns undefined when the model supports no reasoning efforts', () => {
    const model = makeModel({ id: 'a', name: 'A' })
    assert.strictEqual(getSupportedReasoningEffort(model, 'medium'), undefined)
  })

  it('returns the preferred effort when the model supports it', () => {
    const model = makeModel({
      id: 'a',
      name: 'A',
      supportedReasoningEfforts: ['low', 'medium', 'high'],
    })
    assert.strictEqual(getSupportedReasoningEffort(model, 'medium'), 'medium')
  })

  it('falls back to the lowest supported effort when preferred is unsupported', () => {
    const model = makeModel({
      id: 'a',
      name: 'A',
      supportedReasoningEfforts: ['high', 'xhigh'],
    })
    assert.strictEqual(getSupportedReasoningEffort(model, 'medium'), 'high')
  })
})

describe('getPreferredDefaultModel', () => {
  it('returns null for an empty model list', () => {
    assert.strictEqual(getPreferredDefaultModel([]), null)
  })

  it('returns the default model when it is in the list', () => {
    const defaultModel = makeModel({
      id: DefaultCopilotModel,
      name: 'Auto',
      billing: { multiplier: 1 },
    })
    const other = makeModel({
      id: 'other-model',
      name: 'Other',
      billing: { multiplier: 0.5 },
    })
    // Even though 'other' is cheaper, the default model is preferred
    const result = getPreferredDefaultModel([other, defaultModel])
    assert.strictEqual(result, defaultModel)
  })

  it('falls back to the cheapest model by billing multiplier', () => {
    const expensive = makeModel({
      id: 'expensive',
      name: 'Expensive',
      billing: { multiplier: 10 },
    })
    const cheap = makeModel({
      id: 'cheap',
      name: 'Cheap',
      billing: { multiplier: 0.1 },
    })
    const mid = makeModel({
      id: 'mid',
      name: 'Mid',
      billing: { multiplier: 2 },
    })
    const result = getPreferredDefaultModel([expensive, mid, cheap])
    assert.strictEqual(result, cheap)
  })

  it('falls back to the cheapest model by token prices', () => {
    const expensive = makeModel({
      id: 'expensive',
      name: 'Expensive',
      billing: {
        tokenPrices: {
          batchSize: 1000000,
          cachePrice: 500,
          inputPrice: 2000,
          outputPrice: 5000,
        },
      },
    })
    const cheap = makeModel({
      id: 'cheap',
      name: 'Cheap',
      billing: {
        tokenPrices: {
          batchSize: 1000000,
          cachePrice: 20,
          inputPrice: 200,
          outputPrice: 1200,
        },
      },
    })
    const mid = makeModel({
      id: 'mid',
      name: 'Mid',
      billing: {
        tokenPrices: {
          batchSize: 1000000,
          cachePrice: 100,
          inputPrice: 1000,
          outputPrice: 2500,
        },
      },
    })
    const result = getPreferredDefaultModel([expensive, mid, cheap])
    assert.strictEqual(result, cheap)
  })

  it('normalizes token price costs by batch size', () => {
    const smallerBatch = makeModel({
      id: 'smaller-batch',
      name: 'Smaller Batch',
      billing: {
        tokenPrices: {
          batchSize: 1000,
          inputPrice: 10,
          outputPrice: 10,
        },
      },
    })
    const largerBatch = makeModel({
      id: 'larger-batch',
      name: 'Larger Batch',
      billing: {
        tokenPrices: {
          batchSize: 1000000,
          inputPrice: 100,
          outputPrice: 100,
        },
      },
    })
    const result = getPreferredDefaultModel([smallerBatch, largerBatch])
    assert.strictEqual(result, largerBatch)
  })

  it('treats models without billing info as most expensive', () => {
    const noBilling = makeModel({
      id: 'no-billing',
      name: 'No Billing',
    })
    const withBilling = makeModel({
      id: 'with-billing',
      name: 'With Billing',
      billing: { multiplier: 5 },
    })
    const result = getPreferredDefaultModel([noBilling, withBilling])
    assert.strictEqual(result, withBilling)
  })

  it('returns the single model when only one is available', () => {
    const only = makeModel({
      id: 'only-model',
      name: 'Only Model',
      billing: { multiplier: 3 },
    })
    const result = getPreferredDefaultModel([only])
    assert.strictEqual(result, only)
  })

  it('prefers default model regardless of billing cost', () => {
    const defaultModel = makeModel({
      id: DefaultCopilotModel,
      name: 'Auto',
      billing: { multiplier: 100 },
    })
    const cheapModel = makeModel({
      id: 'cheap',
      name: 'Cheap',
      billing: { multiplier: 0.01 },
    })
    const result = getPreferredDefaultModel([cheapModel, defaultModel])
    assert.strictEqual(result, defaultModel)
  })

  it('treats models without token prices as most expensive in usage billing', () => {
    const noBilling = makeModel({
      id: 'no-billing',
      name: 'No Billing',
    })
    const withBilling = makeModel({
      id: 'with-billing',
      name: 'With Billing',
      billing: {
        tokenPrices: {
          batchSize: 1000000,
          inputPrice: 500,
          outputPrice: 1000,
        },
      },
    })
    const result = getPreferredDefaultModel([noBilling, withBilling])
    assert.strictEqual(result, withBilling)
  })

  it('treats models with incomplete token prices as most expensive in usage billing', () => {
    const incomplete = makeModel({
      id: 'incomplete',
      name: 'Incomplete',
      billing: {
        tokenPrices: {
          batchSize: 1000000,
          inputPrice: 1,
        },
      },
    })
    const complete = makeModel({
      id: 'complete',
      name: 'Complete',
      billing: {
        tokenPrices: {
          batchSize: 1000000,
          inputPrice: 100,
          outputPrice: 100,
        },
      },
    })

    const result = getPreferredDefaultModel([incomplete, complete])
    assert.strictEqual(result, complete)
  })
})

/**
 * A minimal fake of the bits of `CopilotSession` that
 * `runConflictResolutionTurn` interacts with: event subscription (returning an
 * unsubscribe fn), `send`, and `disconnect`. Lets us drive the streaming turn
 * deterministically and assert teardown behaviour.
 */
function createFakeSession() {
  const handlers: Record<string, Array<(event: unknown) => void>> = {}
  let unsubCalls = 0
  let disconnectCalls = 0
  let sendCalls = 0

  const session = {
    on(event: string, handler: (event: unknown) => void) {
      handlers[event] = handlers[event] ?? []
      handlers[event].push(handler)
      let unsubscribed = false
      return () => {
        if (!unsubscribed) {
          unsubscribed = true
          unsubCalls++
        }
      }
    },
    send() {
      sendCalls++
      // Never settles on its own — the turn completes via emitted events.
      return new Promise<void>(() => {})
    },
    disconnect() {
      disconnectCalls++
      return Promise.resolve()
    },
  }

  const emit = (event: string, data: unknown) => {
    for (const handler of handlers[event] ?? []) {
      handler({ data })
    }
  }

  return {
    session: session as unknown as CopilotSession,
    emit,
    get unsubCalls() {
      return unsubCalls
    },
    get disconnectCalls() {
      return disconnectCalls
    },
    get sendCalls() {
      return sendCalls
    },
  }
}

describe('runConflictResolutionTurn', () => {
  it('rejects as aborted and tears down the session when cancelled mid-turn', async () => {
    const fake = createFakeSession()
    const controller = new AbortController()

    const promise = runConflictResolutionTurn(fake.session, 'prompt', {
      timeoutMs: 60_000,
      signal: controller.signal,
    })

    controller.abort()

    await assert.rejects(promise, (err: unknown) =>
      isCopilotConflictResolutionAbortError(err)
    )
    // The in-flight turn is torn down: session disconnected once, all four event
    // listeners unsubscribed exactly once.
    assert.strictEqual(fake.disconnectCalls, 1)
    assert.strictEqual(fake.unsubCalls, 4)
  })

  it('rejects and disconnects the session for an already-aborted signal', async () => {
    const fake = createFakeSession()
    const controller = new AbortController()
    controller.abort()

    await assert.rejects(
      runConflictResolutionTurn(fake.session, 'prompt', {
        timeoutMs: 60_000,
        signal: controller.signal,
      }),
      (err: unknown) => err instanceof CopilotConflictResolutionAbortError
    )

    // The session is still disconnected even though we bailed before sending.
    assert.strictEqual(fake.disconnectCalls, 1)
    assert.strictEqual(fake.sendCalls, 0)
  })

  it('resolves with the final message content and disconnects the session once', async () => {
    const fake = createFakeSession()
    const controller = new AbortController()

    const promise = runConflictResolutionTurn(fake.session, 'prompt', {
      timeoutMs: 60_000,
      signal: controller.signal,
    })

    fake.emit('assistant.message', { content: 'RESOLVED' })

    assert.strictEqual(await promise, 'RESOLVED')
    assert.strictEqual(fake.disconnectCalls, 1)

    // A late abort after completion must not re-tear-down or double-disconnect.
    controller.abort()
    assert.strictEqual(fake.disconnectCalls, 1)
  })

  it('streams reasoning snippets sentence-by-sentence', async () => {
    const fake = createFakeSession()
    const snippets: Array<string> = []

    const promise = runConflictResolutionTurn(fake.session, 'prompt', {
      timeoutMs: 60_000,
      onReasoningSnippet: snippet => snippets.push(snippet),
    })

    fake.emit('assistant.reasoning_delta', {
      deltaContent: 'Looking at both sides. Now comparing changes. ',
    })
    fake.emit('assistant.message', { content: 'RESOLVED' })

    await promise

    assert.deepStrictEqual(snippets, [
      'Looking at both sides.',
      'Now comparing changes.',
    ])
  })
})
