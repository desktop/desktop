import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Account } from '../../src/models/account'
import {
  AccountsStore,
  AccountRequiresSignInError,
} from '../../src/lib/stores/accounts-store'
import {
  IOAuthToken,
  OAuthRefreshRejectedError,
  OAuthTokenResponseError,
} from '../../src/lib/oauth-token'
import {
  deserializeAccountCredential,
  serializeAccountCredential,
} from '../../src/lib/account-credential'
import { getKeyForAccount } from '../../src/lib/auth'
import { API } from '../../src/lib/api'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'

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
const rotating: IOAuthToken = {
  accessToken: account.token,
  refreshToken: 'old-refresh',
  expiresAt: now + 600_000,
  refreshTokenExpiresAt: now + 100_000_000,
}
const renewed: IOAuthToken = {
  accessToken: 'new-access',
  refreshToken: 'new-refresh',
  expiresAt: now + 28_800_000,
  refreshTokenExpiresAt: now + 200_000_000,
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => {
    resolve = r
  })
  return { promise, resolve }
}

function setup(
  renew: (endpoint: string, token: string) => Promise<IOAuthToken> = async () =>
    renewed
) {
  const data = new InMemoryStore()
  const secure = new AsyncInMemoryStore()
  const revoked: string[] = []
  const store = new AccountsStore(
    data,
    secure,
    renew,
    () => now,
    async a => {
      revoked.push(a.token)
      return true
    }
  )
  return { store, data, secure, revoked }
}

describe('OAuth credential persistence', () => {
  it('reads existing access-token entries', () => {
    assert.deepEqual(deserializeAccountCredential('legacy'), {
      accessToken: 'legacy',
    })
    assert.equal(
      serializeAccountCredential({ accessToken: 'legacy' }),
      'legacy'
    )
  })

  it('round trips the entire rotating pair and reauthentication marker', () => {
    assert.deepEqual(
      deserializeAccountCredential(serializeAccountCredential(rotating)),
      rotating
    )
    assert.equal(
      deserializeAccountCredential(serializeAccountCredential(null)),
      null
    )
  })

  it('rejects corrupted or unsupported records without exposing secrets', () => {
    for (const value of [
      'github-desktop-oauth:secret',
      'github-desktop-oauth:{"version":2,"credential":"secret"}',
      'github-desktop-oauth:{"version":1,"credential":{"accessToken":"secret"}}',
    ]) {
      assert.throws(
        () => deserializeAccountCredential(value),
        error => error instanceof Error && !error.message.includes('secret')
      )
    }
  })

  it('stores secrets only in secure storage and restores metadata on restart', async () => {
    const { store, data, secure } = setup()
    await store.addAccount(account, rotating)
    const raw = data.getItem('users') ?? ''
    assert.ok(!raw.includes('old-access') && !raw.includes('old-refresh'))
    assert.deepEqual(
      deserializeAccountCredential(
        await secure.getItem(getKeyForAccount(account), account.login)
      ),
      rotating
    )
    const restarted = new AccountsStore(
      data,
      secure,
      async () => renewed,
      () => now
    )
    assert.equal(
      await restarted.resolveToken(account.endpoint, account.token),
      renewed.accessToken
    )
  })
})

describe('Coordinated account token renewal', () => {
  it('allows explicitly anonymous public API requests while an account requires sign-in', async t => {
    const { store } = setup()
    await store.addAccount(account)
    await store.invalidateToken(account.endpoint, account.token)
    t.after(API.setTokenProvider(store.resolveToken))
    let calls = 0
    t.mock.method(
      globalThis,
      'fetch',
      async (_url: unknown, init: RequestInit) => {
        calls++
        assert.equal(new Headers(init.headers).has('Authorization'), false)
        return Response.json({ name: 'public-repo' })
      }
    )
    const repository = await API.fromAccount(
      Account.anonymous()
    ).fetchRepository('octocat', 'public-repo')
    assert.equal(repository?.name, 'public-repo')
    assert.equal(calls, 1)
    await assert.rejects(
      store.getAccountWithFreshToken(account),
      AccountRequiresSignInError
    )
  })
  it('leaves non-expiring credentials alone', async () => {
    const { store } = setup(async () => {
      throw new Error('Unexpected refresh')
    })
    await store.addAccount(account)
    assert.equal(
      await store.resolveToken(account.endpoint, account.token),
      account.token
    )
  })

  for (const expiresAt of [now + 600_000, now - 1, undefined]) {
    it(`renews at the inclusive ten-minute boundary, after expiry, or without expiry (${expiresAt})`, async () => {
      const { store } = setup()
      await store.addAccount(account, { ...rotating, expiresAt })
      assert.equal(
        await store.resolveToken(account.endpoint, account.token),
        renewed.accessToken
      )
    })
  }

  it('does not renew outside the margin', async () => {
    const { store } = setup(async () => {
      throw new Error('Unexpected refresh')
    })
    await store.addAccount(account, { ...rotating, expiresAt: now + 600_001 })
    assert.equal(
      await store.resolveToken(account.endpoint, account.token),
      account.token
    )
  })

  it('shares one exchange across simultaneous callers and updates stale snapshots', async () => {
    let calls = 0
    const gate = deferred<IOAuthToken>()
    const { store, secure } = setup(async (endpoint, token) => {
      assert.equal(endpoint, 'https://github.com')
      assert.equal(token, rotating.refreshToken)
      calls++
      return gate.promise
    })
    await store.addAccount(account, rotating)
    const requests = Array.from({ length: 50 }, () =>
      store.resolveToken(account.endpoint, account.token)
    )
    gate.resolve(renewed)
    assert.deepEqual(
      await Promise.all(requests),
      Array(50).fill(renewed.accessToken)
    )
    assert.equal(calls, 1)
    assert.equal(
      (await store.getAccountWithFreshToken(account)).token,
      renewed.accessToken
    )
    assert.deepEqual(
      deserializeAccountCredential(
        await secure.getItem(getKeyForAccount(account), account.login)
      ),
      renewed
    )
  })

  for (const failRenewal of [false, true]) {
    it(`joins a longer-margin renewal before returning an otherwise valid token (failure: ${failRenewal})`, async () => {
      const gate = deferred<void>()
      const started = deferred<void>()
      let calls = 0
      const { store } = setup(async () => {
        calls++
        started.resolve()
        await gate.promise
        if (failRenewal) {
          throw new Error('Network unavailable')
        }
        return renewed
      })
      await store.addAccount(account, {
        ...rotating,
        expiresAt: now + 30 * 60 * 1000,
      })
      const copilot = store.getAccountWithFreshToken(account, 61 * 60 * 1000)
      await started.promise
      let settled = 0
      const requests = [
        copilot.then(a => a.token),
        store.resolveToken(account.endpoint, account.token),
        store.getAccountWithFreshToken(account).then(a => a.token),
      ].map(request =>
        request.finally(() => {
          settled++
        })
      )
      const result = Promise.allSettled(requests)
      try {
        await new Promise<void>(resolve => setImmediate(resolve))
        assert.equal(settled, 0)
      } finally {
        gate.resolve()
      }
      assert.deepEqual(
        await result,
        requests.map(() =>
          failRenewal
            ? { status: 'rejected', reason: new Error('Network unavailable') }
            : { status: 'fulfilled', value: renewed.accessToken }
        )
      )
      assert.equal(calls, 1)
    })
  }

  it('retains credentials on temporary failure and prevents immediate retry storms', async () => {
    let calls = 0
    const { store, secure } = setup(async () => {
      calls++
      throw new Error('Network unavailable')
    })
    await store.addAccount(account, rotating)
    let prompts = 0
    store.onRequiresSignIn(() => prompts++)
    await assert.rejects(
      store.resolveToken(account.endpoint, account.token),
      /Network unavailable/
    )
    await assert.rejects(
      store.resolveToken(account.endpoint, account.token),
      /try again shortly/
    )
    assert.equal(calls, 1)
    assert.equal(prompts, 0)
    assert.deepEqual(
      deserializeAccountCredential(
        await secure.getItem(getKeyForAccount(account), account.login)
      ),
      rotating
    )
  })

  for (const error of [
    new OAuthRefreshRejectedError(),
    new OAuthTokenResponseError(),
  ]) {
    it(`requires reauthentication once for ${error.name} and persists the blocked state`, async () => {
      const { store, data, secure } = setup(async () => {
        throw error
      })
      await store.addAccount(account, rotating)
      let prompts = 0
      store.onRequiresSignIn(a => {
        prompts++
        assert.equal(a.token, '')
      })
      await assert.rejects(store.resolveToken(account.endpoint, account.token))
      await assert.rejects(
        store.resolveToken(account.endpoint, account.token),
        AccountRequiresSignInError
      )
      assert.equal(prompts, 1)
      assert.equal((await store.getAll())[0].token, '')
      assert.equal(
        deserializeAccountCredential(
          await secure.getItem(getKeyForAccount(account), account.login)
        ),
        null
      )
      const restarted = new AccountsStore(data, secure)
      const loaded = (await restarted.getAll())[0]
      await assert.rejects(
        restarted.getAccountWithFreshToken(loaded),
        AccountRequiresSignInError
      )
    })
  }

  it('does not return a new token when persistence fails or downgrade storage', async t => {
    const { store, secure, data, revoked } = setup()
    await store.addAccount(account, rotating)
    t.mock.method(secure, 'setItem', async () => {
      throw new Error('Keychain locked')
    })
    const errors: Error[] = []
    store.onDidError(e => errors.push(e))
    await assert.rejects(
      store.resolveToken(account.endpoint, account.token),
      /Unable to save/
    )
    await assert.rejects(
      store.getAccountWithFreshToken(account),
      AccountRequiresSignInError
    )
    assert.deepEqual(revoked, [renewed.accessToken])
    assert.ok(errors.length > 0)
    assert.ok(
      !data.getItem('users')?.includes(renewed.refreshToken ?? 'new-refresh')
    )
  })

  it('persists recovery and releases callers before a stalled revocation times out', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const data = new InMemoryStore()
    const secure = new AsyncInMemoryStore()
    const store = new AccountsStore(
      data,
      secure,
      async () => renewed,
      () => now
    )
    await store.addAccount(account, rotating)
    const original = secure.setItem.bind(secure)
    t.mock.method(
      secure,
      'setItem',
      async (key: string, login: string, value: string) => {
        if (value === serializeAccountCredential(renewed)) {
          throw new Error('Keychain locked')
        }
        return original(key, login, value)
      }
    )
    let signal: AbortSignal | null | undefined
    const stalled = deferred<Response>()
    t.after(() => stalled.resolve(new Response(null, { status: 204 })))
    const fetch = t.mock.method(
      globalThis,
      'fetch',
      (_input: RequestInfo | URL, init?: RequestInit) => {
        signal = init?.signal
        return stalled.promise
      }
    )
    const warnings = t.mock.method(log, 'warn')
    let prompts = 0
    store.onRequiresSignIn(() => prompts++)
    const results = Promise.allSettled([
      store.resolveToken(account.endpoint, account.token),
      store.getAccountWithFreshToken(account),
    ])
    await new Promise<void>(resolve => setImmediate(resolve))
    assert.equal(prompts, 1)
    assert.equal((await store.getAll())[0].token, '')
    assert.equal(
      deserializeAccountCredential(
        await secure.getItem(getKeyForAccount(account), account.login)
      ),
      null
    )
    for (const result of await results) {
      assert.equal(result.status, 'rejected')
      if (result.status === 'rejected') {
        assert.match(result.reason.message, /Unable to save/)
      }
    }
    await assert.rejects(
      store.getAccountWithFreshToken(account),
      AccountRequiresSignInError
    )
    assert.equal(fetch.mock.callCount(), 1)
    assert.equal(signal?.aborted, false)
    t.mock.timers.tick(29_999)
    assert.equal(signal?.aborted, false)
    t.mock.timers.tick(1)
    await new Promise<void>(resolve => setImmediate(resolve))
    assert.equal(signal?.aborted, true)
    assert.deepEqual(
      warnings.mock.calls.map(call => call.arguments),
      [['Unable to revoke unused OAuth credentials.']]
    )
  })

  for (const rejects of [false, true]) {
    it(`keeps recovery independent of revocation failure (rejects: ${rejects})`, async t => {
      t.mock.timers.enable({ apis: ['setTimeout'] })
      const data = new InMemoryStore()
      const secure = new AsyncInMemoryStore()
      const warnings = t.mock.method(log, 'warn')
      let signal: AbortSignal | undefined
      const store = new AccountsStore(
        data,
        secure,
        async () => renewed,
        () => now,
        async (_account, cancellation) => {
          signal = cancellation
          if (rejects) {
            throw new Error('secret-revocation-failure')
          }
          return false
        }
      )
      await store.addAccount(account, rotating)
      const original = secure.setItem.bind(secure)
      t.mock.method(
        secure,
        'setItem',
        async (key: string, login: string, value: string) => {
          if (value === serializeAccountCredential(renewed)) {
            throw new Error('Keychain locked')
          }
          return original(key, login, value)
        }
      )
      await assert.rejects(
        store.resolveToken(account.endpoint, account.token),
        /Unable to save/
      )
      assert.equal((await store.getAll())[0].token, '')
      assert.equal(
        deserializeAccountCredential(
          await secure.getItem(getKeyForAccount(account), account.login)
        ),
        null
      )
      assert.deepEqual(
        warnings.mock.calls.map(call => call.arguments),
        [['Unable to revoke unused OAuth credentials.']]
      )
      t.mock.timers.tick(30_000)
      assert.equal(signal?.aborted, false)
    })
  }

  it('sign-out during exchange prevents resurrection and revokes the unused replacement', async () => {
    const gate = deferred<IOAuthToken>()
    const started = deferred<void>()
    const { store, secure, revoked } = setup(async () => {
      started.resolve()
      return gate.promise
    })
    await store.addAccount(account, rotating)
    const pending = store.resolveToken(account.endpoint, account.token)
    const rejected = assert.rejects(pending, AccountRequiresSignInError)
    await started.promise
    await store.removeAccount(account)
    gate.resolve(renewed)
    await rejected
    assert.deepEqual(await store.getAll(), [])
    assert.equal(
      await secure.getItem(getKeyForAccount(account), account.login),
      null
    )
    assert.deepEqual(revoked, [renewed.accessToken])
    await assert.rejects(
      store.resolveToken(account.endpoint, account.token),
      AccountRequiresSignInError
    )
  })

  it('sign-out during persistence deletes the late write', async t => {
    const { store, secure } = setup()
    await store.addAccount(account, rotating)
    const original = secure.setItem.bind(secure)
    const writing = deferred<void>()
    const gate = deferred<void>()
    t.mock.method(
      secure,
      'setItem',
      async (key: string, login: string, value: string) => {
        writing.resolve()
        await gate.promise
        await original(key, login, value)
      }
    )
    const pending = store.resolveToken(account.endpoint, account.token)
    const rejected = assert.rejects(pending, AccountRequiresSignInError)
    await writing.promise
    const removal = store.removeAccount(account)
    gate.resolve()
    await Promise.all([removal, rejected])
    assert.deepEqual(await store.getAll(), [])
    assert.equal(
      await secure.getItem(getKeyForAccount(account), account.login),
      null
    )
  })

  it('replacing an account never redirects stale clients to another identity', async () => {
    const { store } = setup()
    await store.addAccount(account, rotating)
    const other = new Account(
      'other',
      account.endpoint,
      'other-token',
      [],
      '',
      2,
      'Other'
    )
    await store.addAccount(other)
    await assert.rejects(
      store.resolveToken(account.endpoint, account.token),
      AccountRequiresSignInError
    )
    assert.equal(
      await store.resolveToken(other.endpoint, other.token),
      other.token
    )
  })

  it('ignores stale 401s after rotation and rejects current invalidated credentials', async () => {
    const { store } = setup()
    await store.addAccount(account, rotating)
    await store.resolveToken(account.endpoint, account.token)
    await store.invalidateToken(account.endpoint, account.token)
    assert.equal((await store.getAll())[0].token, renewed.accessToken)
    await store.invalidateToken(account.endpoint, renewed.accessToken)
    await assert.rejects(
      store.getAccountWithFreshToken(account),
      AccountRequiresSignInError
    )
  })

  it('does not invalidate a new pair for an old 401 arriving during renewal', async () => {
    const gate = deferred<IOAuthToken>()
    const started = deferred<void>()
    const { store } = setup(async () => {
      started.resolve()
      return gate.promise
    })
    await store.addAccount(account, rotating)
    const pending = store.resolveToken(account.endpoint, account.token)
    await started.promise
    const invalidation = store.invalidateToken(account.endpoint, account.token)
    gate.resolve(renewed)
    await Promise.all([pending, invalidation])
    assert.equal((await store.getAll())[0].token, renewed.accessToken)
  })

  it('does not publish a cancelled login after secure storage completes', async t => {
    const { store, secure } = setup()
    let current = true
    const original = secure.setItem.bind(secure)
    t.mock.method(
      secure,
      'setItem',
      async (key: string, login: string, value: string) => {
        await original(key, login, value)
        current = false
      }
    )
    assert.equal(await store.addAccount(account, rotating, () => current), null)
    assert.deepEqual(await store.getAll(), [])
    assert.equal(
      await secure.getItem(getKeyForAccount(account), account.login),
      null
    )
  })
})
