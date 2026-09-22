import assert from 'node:assert'
import { describe, it, TestContext } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import {
  API,
  getDotComAPIEndpoint,
  getOAuthAuthorizationURL,
  requestOAuthToken,
} from '../../src/lib/api'
import { shell } from '../../src/lib/app-shell'
import { AccountsStore } from '../../src/lib/stores/accounts-store'
import {
  SignInResult,
  SignInStep,
  SignInStore,
} from '../../src/lib/stores/sign-in-store'
import { Account } from '../../src/models/account'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'

const endpoint = getDotComAPIEndpoint()
const oauthResponse = {
  access_token: 'oauth-access-secret',
  refresh_token: 'oauth-refresh-secret',
  expires_in: 28_800,
  refresh_token_expires_in: 15_897_600,
}
const userResponse = {
  login: 'octocat',
  id: 1,
  name: 'Octocat',
  avatar_url: 'https://avatars.githubusercontent.com/u/1',
  plan: { name: 'free' },
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Deferred promise is not initialized')
  }
  const promise = new Promise<T>(resolver => {
    resolve = resolver
  })
  return { promise, resolve }
}

async function createAuthentication(
  t: TestContext,
  exchange: () => Promise<Response> = async () => Response.json(oauthResponse)
) {
  const dataStore = new InMemoryStore()
  const secureStore = new AsyncInMemoryStore()
  const accountsStore = new AccountsStore(dataStore, secureStore)
  await accountsStore.getAll()
  t.after(API.setTokenProvider(accountsStore.resolveToken))
  const signInStore = new SignInStore(accountsStore)
  const results: SignInResult[] = []
  const authenticated: Account[] = []
  const stateSnapshots: string[] = []
  const disposeAuthentication = signInStore.onDidAuthenticate(account =>
    authenticated.push(account)
  )
  const disposeUpdates = signInStore.onDidUpdate(state =>
    stateSnapshots.push(JSON.stringify(state))
  )
  t.after(() => {
    disposeAuthentication.dispose()
    disposeUpdates.dispose()
    signInStore.reset()
  })
  t.mock.method(shell, 'openExternal', async () => true)
  const fetchMock = t.mock.method(
    globalThis,
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      assert.ok(typeof input === 'string')
      const url = new URL(input)
      if (url.pathname === '/login/oauth/access_token') {
        return exchange()
      }
      assert.strictEqual(
        new Headers(init?.headers).get('Authorization'),
        `Bearer ${oauthResponse.access_token}`
      )
      switch (url.pathname) {
        case '/user':
          return Response.json(userResponse)
        case '/user/emails':
          return Response.json([
            {
              email: 'octocat@example.com',
              primary: true,
              verified: true,
              visibility: null,
            },
          ])
        case '/desktop_internal/features':
          return Response.json({ features: [] })
        case '/graphql':
          return Response.json({
            data: {
              viewer: {
                copilotEndpoints: { api: 'https://api.githubcopilot.com' },
                copilotLicenseType: 'none',
                isCopilotDesktopEnabled: false,
              },
            },
          })
        default:
          throw new Error(`Unexpected test request: ${url.pathname}`)
      }
    }
  )

  signInStore.beginDotComSignIn(result => results.push(result))
  await signInStore.authenticateWithBrowser()
  const state = signInStore.getState()
  assert.ok(state?.kind === SignInStep.Authentication)
  assert.ok(state.oauthState)
  const action = {
    name: 'oauth' as const,
    code: 'browser-authorization-code',
    state: state.oauthState.state,
  }
  return {
    accountsStore,
    dataStore,
    secureStore,
    signInStore,
    results,
    authenticated,
    stateSnapshots,
    action,
    fetchMock,
  }
}

describe('OAuth API integration', () => {
  for (const shortLived of [false, true]) {
    for (const apiEndpoint of [
      endpoint,
      'https://enterprise.example.com/api/v3',
    ]) {
      it(`preserves scopes with short-lived tokens ${shortLived} at ${apiEndpoint}`, () => {
        const url = new URL(
          getOAuthAuthorizationURL(apiEndpoint, 'csrf-state', shortLived)
        )
        assert.strictEqual(url.pathname, '/login/oauth/authorize')
        assert.strictEqual(url.searchParams.get('state'), 'csrf-state')
        assert.deepStrictEqual(
          url.searchParams.get('scope')?.split(' '),
          shortLived
            ? ['repo', 'user', 'workflow', 'offline_access']
            : ['repo', 'user', 'workflow']
        )
        assert.strictEqual(
          url.hostname,
          apiEndpoint === endpoint ? 'github.com' : 'enterprise.example.com'
        )
      })
    }
  }

  it('exchanges against the HTML endpoint and retains all credential metadata', async t => {
    const now = 1_700_000_000_000
    t.mock.timers.enable({ apis: ['Date'], now })
    t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
      assert.strictEqual(
        input,
        'https://enterprise.example.com/login/oauth/access_token'
      )
      return Response.json(oauthResponse)
    })
    assert.deepStrictEqual(
      await requestOAuthToken(
        'https://enterprise.example.com/api/v3',
        'browser-code'
      ),
      {
        accessToken: oauthResponse.access_token,
        refreshToken: oauthResponse.refresh_token,
        expiresAt: now + oauthResponse.expires_in * 1000,
        refreshTokenExpiresAt:
          now + oauthResponse.refresh_token_expires_in * 1000,
      }
    )
  })

  it('resolves the current token for every request made by a long-lived client', async t => {
    const suppliedTokens = ['first-current-token', 'second-current-token']
    const provider = t.mock.fn(
      async (actualEndpoint: string, token: string) => {
        assert.strictEqual(actualEndpoint, endpoint)
        assert.strictEqual(token, 'stale-snapshot')
        const resolved = suppliedTokens.shift()
        assert.ok(resolved)
        return resolved
      }
    )
    const cleanup = API.setTokenProvider(provider)
    t.after(cleanup)
    const authorization: Array<string | null> = []
    t.mock.method(
      globalThis,
      'fetch',
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        authorization.push(new Headers(init?.headers).get('Authorization'))
        return Response.json(userResponse)
      }
    )
    const api = new API(endpoint, 'stale-snapshot')
    await api.fetchAccount()
    await api.fetchAccount()
    assert.strictEqual(provider.mock.callCount(), 2)
    assert.deepStrictEqual(authorization, [
      'Bearer first-current-token',
      'Bearer second-current-token',
    ])
  })

  it('invalidates the token actually sent on 401 without replaying the request', async t => {
    const provider = t.mock.fn(async () => 'current-token')
    t.after(API.setTokenProvider(provider))
    const invalidated = t.mock.fn((_endpoint: string, _token: string) => {})
    API.onTokenInvalidated(invalidated)
    const fetchMock = t.mock.method(
      globalThis,
      'fetch',
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        assert.strictEqual(
          new Headers(init?.headers).get('Authorization'),
          'Bearer current-token'
        )
        return Response.json(
          { message: 'Bad credentials' },
          { status: 401, headers: { 'X-GitHub-Request-Id': 'test-request' } }
        )
      }
    )
    await assert.rejects(
      new API(endpoint, 'stale-snapshot').fetchAccount(),
      /Bad credentials/
    )
    assert.strictEqual(provider.mock.callCount(), 1)
    assert.strictEqual(fetchMock.mock.callCount(), 1)
    assert.strictEqual(invalidated.mock.callCount(), 1)
    assert.deepStrictEqual(invalidated.mock.calls[0].arguments, [
      endpoint,
      'current-token',
    ])
  })

  it('does not send a request when credential resolution fails', async t => {
    t.after(
      API.setTokenProvider(async () => {
        throw new Error('Sign in required')
      })
    )
    const fetchMock = t.mock.method(globalThis, 'fetch', async () =>
      Response.json(userResponse)
    )
    await assert.rejects(
      new API(endpoint, 'stale-snapshot').fetchAccount(),
      /Sign in required/
    )
    assert.strictEqual(fetchMock.mock.callCount(), 0)
  })

  for (const headers of [
    new Headers(),
    new Headers({
      'X-GitHub-Request-Id': 'test-request',
      'X-GitHub-OTP': 'required; app',
    }),
  ]) {
    it('does not invalidate credentials for proxy or OTP-required 401 responses', async t => {
      t.after(API.setTokenProvider(async () => 'current-token'))
      const invalidated = t.mock.fn((_endpoint: string, _token: string) => {})
      API.onTokenInvalidated(invalidated)
      const fetchMock = t.mock.method(globalThis, 'fetch', async () =>
        Response.json({ message: 'Not authorized' }, { status: 401, headers })
      )
      await assert.rejects(
        new API(endpoint, 'stale-snapshot').fetchAccount(),
        /Not authorized/
      )
      assert.strictEqual(fetchMock.mock.callCount(), 1)
      assert.strictEqual(invalidated.mock.callCount(), 0)
    })
  }

  it('restores the previous token provider on cleanup', async t => {
    const restoreInitial = API.setTokenProvider(async () => 'original-provider')
    t.after(restoreInitial)
    const restorePrevious = API.setTokenProvider(
      async () => 'temporary-provider'
    )
    const authorization: Array<string | null> = []
    t.mock.method(
      globalThis,
      'fetch',
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        authorization.push(new Headers(init?.headers).get('Authorization'))
        return Response.json(userResponse)
      }
    )
    const api = new API(endpoint, 'snapshot')
    await api.fetchAccount()
    restorePrevious()
    await api.fetchAccount()
    assert.deepStrictEqual(authorization, [
      'Bearer temporary-provider',
      'Bearer original-provider',
    ])
  })
})

describe('OAuth sign-in integration', { timeout: 10_000 }, () => {
  it('emits success only after saving credentials and keeps refresh secrets out of public state', async t => {
    const harness = await createAuthentication(t)
    const started = deferred<void>()
    const release = deferred<void>()
    const save = harness.secureStore.setItem.bind(harness.secureStore)
    const storage = t.mock.method(
      harness.secureStore,
      'setItem',
      async (key: string, login: string, value: string) => {
        started.resolve()
        await release.promise
        await save(key, login, value)
      }
    )
    const completion = harness.signInStore.resolveOAuthRequest(harness.action)
    await started.promise
    assert.strictEqual(harness.authenticated.length, 0)
    assert.strictEqual(harness.results.length, 0)
    assert.deepStrictEqual(await harness.accountsStore.getAll(), [])
    assert.strictEqual(
      harness.signInStore.getState()?.kind,
      SignInStep.Authentication
    )
    release.resolve()
    await completion
    await setImmediate()

    assert.strictEqual(harness.authenticated.length, 1)
    assert.strictEqual(harness.results.length, 1)
    assert.strictEqual(harness.results[0].kind, 'success')
    assert.strictEqual(harness.signInStore.getState()?.kind, SignInStep.Success)
    assert.strictEqual(storage.mock.callCount(), 1)
    const [key, login, value] = storage.mock.calls[0].arguments
    assert.ok(value !== undefined)
    assert.strictEqual(await harness.secureStore.getItem(key, login), value)
    assert.ok(value.includes(oauthResponse.refresh_token))
    assert.ok(value.includes(oauthResponse.access_token))
    assert.strictEqual(harness.fetchMock.mock.callCount(), 5)

    for (const publicState of [
      ...harness.stateSnapshots,
      JSON.stringify(harness.authenticated),
      JSON.stringify(harness.results),
      JSON.stringify(await harness.accountsStore.getAll()),
      harness.dataStore.getItem('users'),
    ]) {
      assert.ok(!publicState.includes(oauthResponse.refresh_token))
      assert.ok(!publicState.includes('refreshToken'))
      assert.ok(!publicState.includes('browser-authorization-code'))
    }
    assert.ok(
      !harness.dataStore.getItem('users').includes(oauthResponse.access_token)
    )
  })

  it('reports storage failure without emitting authentication success', async t => {
    const harness = await createAuthentication(t)
    t.mock.method(harness.secureStore, 'setItem', async () => {
      throw new Error(
        `Secure storage unavailable: ${oauthResponse.refresh_token}`
      )
    })
    await harness.signInStore.resolveOAuthRequest(harness.action)
    await setImmediate()
    const state = harness.signInStore.getState()
    assert.ok(state?.kind === SignInStep.Authentication)
    assert.ok(state.error)
    assert.strictEqual(state.loading, false)
    assert.deepStrictEqual(harness.authenticated, [])
    assert.deepStrictEqual(harness.results, [])
    assert.deepStrictEqual(await harness.accountsStore.getAll(), [])
    assert.ok(!state.error.message.includes(oauthResponse.refresh_token))
  })

  it('ignores duplicate OAuth callbacks while exchange is in flight', async t => {
    const response = deferred<Response>()
    const harness = await createAuthentication(t, () => response.promise)
    const first = harness.signInStore.resolveOAuthRequest(harness.action)
    await harness.signInStore.resolveOAuthRequest(harness.action)
    assert.strictEqual(harness.fetchMock.mock.callCount(), 1)
    response.resolve(Response.json(oauthResponse))
    await first
    await setImmediate()
    await harness.signInStore.resolveOAuthRequest(harness.action)
    assert.strictEqual(harness.authenticated.length, 1)
    assert.strictEqual(harness.results.length, 1)
    assert.strictEqual(harness.fetchMock.mock.callCount(), 5)
  })

  it('does not save or authenticate after cancellation during code exchange', async t => {
    const response = deferred<Response>()
    const harness = await createAuthentication(t, () => response.promise)
    const storage = t.mock.method(harness.secureStore, 'setItem')
    const completion = harness.signInStore.resolveOAuthRequest(harness.action)
    harness.signInStore.reset()
    response.resolve(Response.json(oauthResponse))
    await completion
    await setImmediate()
    assert.strictEqual(harness.signInStore.getState(), null)
    assert.deepStrictEqual(harness.results, [{ kind: 'cancelled' }])
    assert.deepStrictEqual(harness.authenticated, [])
    assert.strictEqual(storage.mock.callCount(), 0)
    assert.strictEqual(harness.fetchMock.mock.callCount(), 1)
  })

  it('removes credentials saved after cancellation during secure storage', async t => {
    const harness = await createAuthentication(t)
    const started = deferred<void>()
    const release = deferred<void>()
    const save = harness.secureStore.setItem.bind(harness.secureStore)
    const storage = t.mock.method(
      harness.secureStore,
      'setItem',
      async (key: string, login: string, value: string) => {
        started.resolve()
        await release.promise
        await save(key, login, value)
      }
    )
    const completion = harness.signInStore.resolveOAuthRequest(harness.action)
    await started.promise
    harness.signInStore.reset()
    release.resolve()
    await completion
    await setImmediate()
    const [key, login] = storage.mock.calls[0].arguments
    assert.strictEqual(await harness.secureStore.getItem(key, login), null)
    assert.deepStrictEqual(await harness.accountsStore.getAll(), [])
    assert.deepStrictEqual(harness.authenticated, [])
    assert.deepStrictEqual(harness.results, [{ kind: 'cancelled' }])
    assert.strictEqual(harness.signInStore.getState(), null)
  })

  it('rejects mismatched OAuth state without issuing requests', async t => {
    const harness = await createAuthentication(t)
    await harness.signInStore.resolveOAuthRequest({
      ...harness.action,
      state: 'another-session',
    })
    assert.strictEqual(harness.fetchMock.mock.callCount(), 0)
    assert.deepStrictEqual(harness.results, [])
    assert.deepStrictEqual(harness.authenticated, [])
  })
})
