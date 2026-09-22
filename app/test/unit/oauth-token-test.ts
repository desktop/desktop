import assert from 'node:assert'
import { describe, it } from 'node:test'
import { getUserAgent } from '../../src/lib/http'
import {
  exchangeOAuthToken,
  OAuthRefreshRejectedError,
  OAuthTokenResponseError,
  parseOAuthToken,
  refreshOAuthToken,
} from '../../src/lib/oauth-token'

const issuedAt = 1_700_000_000_000
const tokenResponse = {
  access_token: 'new-access-token',
  refresh_token: 'new-refresh-token',
  expires_in: 28_800,
  refresh_token_expires_in: 15_897_600,
  token_type: 'bearer',
  scope: 'repo,user,workflow',
}

describe('parseOAuthToken', () => {
  it('parses rotating credentials and absolute expiration times', () => {
    assert.deepStrictEqual(parseOAuthToken(tokenResponse, issuedAt), {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt: issuedAt + 28_800_000,
      refreshTokenExpiresAt: issuedAt + 15_897_600_000,
    })
  })

  it('accepts legacy credentials without inventing metadata', () => {
    assert.deepStrictEqual(
      parseOAuthToken({ access_token: 'legacy-token' }, issuedAt),
      { accessToken: 'legacy-token' }
    )
  })

  it('keeps missing lifetimes unknown even when a refresh token exists', () => {
    assert.deepStrictEqual(
      parseOAuthToken(
        { access_token: 'access', refresh_token: 'refresh' },
        issuedAt
      ),
      { accessToken: 'access', refreshToken: 'refresh' }
    )
  })

  it('accepts zero lifetimes as already expired', () => {
    const token = parseOAuthToken(
      { ...tokenResponse, expires_in: 0, refresh_token_expires_in: 0 },
      issuedAt
    )
    assert.strictEqual(token.expiresAt, issuedAt)
    assert.strictEqual(token.refreshTokenExpiresAt, issuedAt)
  })

  for (const value of [
    null,
    undefined,
    [],
    'secret-response',
    {},
    { access_token: 123 },
    { access_token: '' },
    { access_token: ' ' },
    { access_token: 'token\nsecret' },
    { ...tokenResponse, refresh_token: '' },
    { ...tokenResponse, refresh_token: undefined },
    { ...tokenResponse, refresh_token: null },
    { ...tokenResponse, refresh_token: 123 },
    { ...tokenResponse, error: 'secret-error' },
    { ...tokenResponse, token_type: 'unknown' },
    { ...tokenResponse, scope: [] },
    { access_token: 'access', refresh_token_expires_in: 60 },
  ]) {
    it('rejects malformed credentials without exposing their contents', () => {
      assert.throws(() => parseOAuthToken(value, issuedAt), {
        name: 'OAuthTokenResponseError',
        message: 'The OAuth token response is invalid.',
      })
    })
  }

  for (const field of ['expires_in', 'refresh_token_expires_in']) {
    for (const value of [
      undefined,
      null,
      '3600',
      '',
      false,
      -1,
      1.5,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER,
    ]) {
      it(`rejects invalid ${field} (${String(value)})`, () => {
        assert.throws(
          () => parseOAuthToken({ ...tokenResponse, [field]: value }, issuedAt),
          OAuthTokenResponseError
        )
      })
    }
  }

  it('rejects invalid issuance timestamps and overflowing expiration times', () => {
    for (const timestamp of [-1, NaN, Infinity, 1.5]) {
      assert.throws(
        () => parseOAuthToken(tokenResponse, timestamp),
        OAuthTokenResponseError
      )
    }
    assert.throws(
      () => parseOAuthToken(tokenResponse, Number.MAX_SAFE_INTEGER),
      OAuthTokenResponseError
    )
  })
})

describe('OAuth token requests', () => {
  for (const endpoint of [
    'https://github.com',
    'https://enterprise.example/',
  ]) {
    it(`exchanges a code at the HTML endpoint ${endpoint}`, async t => {
      t.mock.timers.enable({ apis: ['Date'], now: issuedAt })
      const fetchMock = t.mock.method(
        globalThis,
        'fetch',
        async (input: RequestInfo | URL, init?: RequestInit) => {
          assert.strictEqual(
            input,
            `${endpoint.replace(/\/$/, '')}/login/oauth/access_token`
          )
          assert.ok(init)
          assert.strictEqual(init.method, 'POST')
          assert.deepStrictEqual(init.headers, {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': getUserAgent(),
          })
          assert.strictEqual(init.redirect, 'error')
          assert.strictEqual(init.cache, 'no-store')
          assert.ok(init.signal)
          assert.strictEqual(init.signal.aborted, false)
          assert.ok(typeof init.body === 'string')
          assert.deepStrictEqual(JSON.parse(init.body), {
            client_id: '',
            client_secret: '',
            code: 'browser-code',
          })
          return Response.json(tokenResponse)
        }
      )
      assert.deepStrictEqual(
        await exchangeOAuthToken(endpoint, 'browser-code'),
        parseOAuthToken(tokenResponse, issuedAt)
      )
      assert.strictEqual(fetchMock.mock.callCount(), 1)
    })
  }

  it('uses the refresh grant and returns both replacement tokens', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: issuedAt })
    const fetchMock = t.mock.method(
      globalThis,
      'fetch',
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        assert.ok(init)
        assert.ok(typeof init.body === 'string')
        assert.deepStrictEqual(JSON.parse(init.body), {
          client_id: '',
          client_secret: '',
          grant_type: 'refresh_token',
          refresh_token: 'old-refresh-token',
        })
        return Response.json(tokenResponse)
      }
    )
    assert.deepStrictEqual(
      await refreshOAuthToken('https://github.com', 'old-refresh-token'),
      parseOAuthToken(tokenResponse, issuedAt)
    )
    assert.strictEqual(fetchMock.mock.callCount(), 1)
  })

  it('supports legacy exchange responses', async t => {
    t.mock.method(globalThis, 'fetch', async () =>
      Response.json({ access_token: 'legacy' })
    )
    assert.deepStrictEqual(
      await exchangeOAuthToken('https://github.com', 'code'),
      { accessToken: 'legacy' }
    )
  })

  for (const value of [
    { access_token: 'access' },
    { refresh_token: 'refresh' },
    { access_token: 'access', refresh_token: '' },
  ]) {
    it('requires both credentials in refresh responses', async t => {
      t.mock.method(globalThis, 'fetch', async () => Response.json(value))
      await assert.rejects(
        refreshOAuthToken('https://github.com', 'refresh'),
        OAuthTokenResponseError
      )
    })
  }

  for (const error of ['bad_refresh_token', 'invalid_grant']) {
    for (const status of [200, 400, 401]) {
      it(`classifies ${error} on refresh with HTTP ${status}`, async t => {
        const fetchMock = t.mock.method(globalThis, 'fetch', async () =>
          Response.json(
            { error, error_description: 'secret-description' },
            { status }
          )
        )
        await assert.rejects(
          refreshOAuthToken('https://github.com', 'secret-token'),
          {
            name: 'OAuthRefreshRejectedError',
            message: 'The OAuth refresh token was rejected.',
          }
        )
        assert.strictEqual(fetchMock.mock.callCount(), 1)
      })
    }

    it(`does not classify ${error} as refresh rejection during exchange`, async t => {
      t.mock.method(globalThis, 'fetch', async () =>
        Response.json({ error, error_description: 'secret-description' })
      )
      await assert.rejects(exchangeOAuthToken('https://github.com', 'code'), {
        name: 'Error',
        message: 'The OAuth token request failed.',
      })
    })
  }

  it('rejects other OAuth errors even with HTTP 200 and valid token fields', async t => {
    t.mock.method(globalThis, 'fetch', async () =>
      Response.json({
        ...tokenResponse,
        error: 'secret-error',
        error_description: 'secret-description',
      })
    )
    await assert.rejects(refreshOAuthToken('https://github.com', 'refresh'), {
      name: 'Error',
      message: 'The OAuth token request failed.',
    })
  })

  it('rejects non-success HTTP statuses without trusting token fields', async t => {
    t.mock.method(globalThis, 'fetch', async () =>
      Response.json(tokenResponse, { status: 500 })
    )
    await assert.rejects(refreshOAuthToken('https://github.com', 'refresh'), {
      name: 'Error',
      message: 'The OAuth token request failed.',
    })
  })

  it('sanitizes malformed JSON responses', async t => {
    t.mock.method(
      globalThis,
      'fetch',
      async () => new Response('secret-response-body')
    )
    await assert.rejects(exchangeOAuthToken('https://github.com', 'code'), {
      name: 'OAuthTokenResponseError',
      message: 'The OAuth token response is invalid.',
    })

    it('treats an HTML gateway failure as temporary rather than a malformed replacement pair', async t => {
      t.mock.method(
        globalThis,
        'fetch',
        async () => new Response('<html>Unavailable</html>', { status: 502 })
      )
      await assert.rejects(refreshOAuthToken('https://github.com', 'refresh'), {
        name: 'Error',
        message: 'The OAuth token request failed.',
      })
    })
  })

  it('sanitizes network failures without retrying', async t => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
      throw new Error('secret-request-body')
    })
    await assert.rejects(refreshOAuthToken('https://github.com', 'refresh'), {
      name: 'Error',
      message: 'The OAuth token request failed.',
    })
    assert.strictEqual(fetchMock.mock.callCount(), 1)
  })

  it('bounds even a fetch that ignores cancellation', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    let signal: AbortSignal | null | undefined
    const fetchMock = t.mock.method(
      globalThis,
      'fetch',
      (_input: RequestInfo | URL, init?: RequestInit) => {
        signal = init?.signal
        return new Promise<Response>(() => {})
      }
    )
    const result = refreshOAuthToken('https://github.com', 'refresh')
    const assertion = assert.rejects(result, {
      name: 'Error',
      message: 'The OAuth token request timed out.',
    })
    t.mock.timers.tick(29_999)
    assert.strictEqual(signal?.aborted, false)
    t.mock.timers.tick(1)
    await assertion
    assert.strictEqual(signal?.aborted, true)
    assert.strictEqual(fetchMock.mock.callCount(), 1)
  })

  it('keeps the deadline active while reading the response body', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    let signal: AbortSignal | null | undefined
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"access_token":'))
      },
    })
    const response = new Response(stream)
    t.mock.method(
      globalThis,
      'fetch',
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        signal = init?.signal
        return response
      }
    )
    const result = exchangeOAuthToken('https://github.com', 'code')
    const assertion = assert.rejects(result, {
      name: 'Error',
      message: 'The OAuth token request timed out.',
    })
    await Promise.resolve()
    assert.strictEqual(response.bodyUsed, true)
    t.mock.timers.tick(30_000)
    await assertion
    assert.strictEqual(signal?.aborted, true)
  })

  it('clears the deadline after a completed request', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    let signal: AbortSignal | null | undefined
    t.mock.method(
      globalThis,
      'fetch',
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        signal = init?.signal
        return Response.json(tokenResponse)
      }
    )
    await refreshOAuthToken('https://github.com', 'refresh')
    t.mock.timers.tick(30_000)
    assert.strictEqual(signal?.aborted, false)
  })

  it('exposes a distinct refresh-rejection error type', () => {
    assert.ok(new OAuthRefreshRejectedError() instanceof Error)
    assert.ok(new OAuthTokenResponseError() instanceof Error)
  })
})
