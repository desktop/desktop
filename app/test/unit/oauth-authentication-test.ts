import assert from 'node:assert'
import { describe, it } from 'node:test'
import { API, getDotComAPIEndpoint } from '../../src/lib/api'
import { AccountsStore } from '../../src/lib/stores/accounts-store'
import { Account } from '../../src/models/account'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'

const endpoint = getDotComAPIEndpoint()

describe('OAuth API integration', () => {
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

  for (const headers of [
    new Headers(),
    new Headers({
      'X-GitHub-Request-Id': 'test-request',
      'X-GitHub-OTP': 'required; app',
    }),
  ]) {
    it('does not invalidate credentials for proxy or OTP-required 401 responses', async t => {
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
})
