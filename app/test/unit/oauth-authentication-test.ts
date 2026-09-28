import assert from 'node:assert'
import { describe, it } from 'node:test'
import { API, getDotComAPIEndpoint } from '../../src/lib/api'
import { AccountsStore } from '../../src/lib/stores/accounts-store'
import { Account } from '../../src/models/account'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'

const endpoint = getDotComAPIEndpoint()
const userResponse = {
  login: 'octocat',
  id: 1,
  name: 'Octocat',
  avatar_url: 'https://avatars.githubusercontent.com/u/1',
  plan: { name: 'free' },
}

describe('OAuth API integration', () => {
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
    t.after(API.onTokenInvalidated(invalidated))
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

  it('routes rejected API credentials to AccountsStore', async t => {
    const store = new AccountsStore(
      new InMemoryStore(),
      new AsyncInMemoryStore()
    )
    const account = new Account(
      'octocat',
      endpoint,
      'current-token',
      [],
      '',
      1,
      'Octocat'
    )
    await store.addAccount(account)
    t.after(API.setTokenProvider(store.resolveToken))
    t.after(API.onTokenInvalidated(store.handleTokenInvalidated))
    const invalidated = new Promise<Account>(resolve =>
      store.onTokenInvalidated(resolve)
    )
    t.mock.method(globalThis, 'fetch', async () =>
      Response.json(
        { message: 'Bad credentials' },
        { status: 401, headers: { 'X-GitHub-Request-Id': 'test-request' } }
      )
    )

    await assert.rejects(
      API.fromAccount(account).fetchAccount(),
      /Bad credentials/
    )
    assert.strictEqual((await invalidated).token, '')
    assert.deepStrictEqual(await store.getAll(), [])
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
      t.after(API.onTokenInvalidated(invalidated))
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
