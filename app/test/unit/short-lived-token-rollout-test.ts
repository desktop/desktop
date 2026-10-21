import assert from 'node:assert'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { enableShortLivedTokens } from '../../src/lib/feature-flag'
import { getVersion } from '../../src/ui/lib/app-proxy'

const guid = '3a4c329f-8d73-4347-9784-04a978fe48db'
let guidError: Error | undefined
mock.module('../../src/lib/get-renderer-guid', {
  namedExports: {
    getRendererGUID: async () => {
      if (guidError !== undefined) {
        throw guidError
      }
      return guid
    },
  },
})

async function checkRollout(endpoint = 'https://api.github.com') {
  const { shouldRequestShortLivedTokens } = await import(
    '../../src/lib/short-lived-token-rollout'
  )
  return shouldRequestShortLivedTokens(endpoint)
}

describe('short-lived token rollout', () => {
  const development = __DEV__
  const channel = __RELEASE_CHANNEL__
  const preview = process.env.GITHUB_DESKTOP_PREVIEW_FEATURES

  beforeEach(() => {
    guidError = undefined
    Object.assign(globalThis, {
      __DEV__: false,
      __RELEASE_CHANNEL__: 'production',
    })
    delete process.env.GITHUB_DESKTOP_PREVIEW_FEATURES
  })

  afterEach(() => {
    Object.assign(globalThis, {
      __DEV__: development,
      __RELEASE_CHANNEL__: channel,
    })
    if (preview === undefined) {
      delete process.env.GITHUB_DESKTOP_PREVIEW_FEATURES
    } else {
      process.env.GITHUB_DESKTOP_PREVIEW_FEATURES = preview
    }
  })

  for (const build of ['production', 'beta', 'development', 'preview']) {
    it(`uses the ${build} build's opt-in before consulting Central, but never for GHES`, async t => {
      Object.assign(globalThis, {
        __DEV__: build === 'development',
        __RELEASE_CHANNEL__: build === 'beta' ? 'beta' : 'production',
      })
      if (build === 'preview') {
        process.env.GITHUB_DESKTOP_PREVIEW_FEATURES = '1'
      }
      const optedIn = build !== 'production'
      assert.strictEqual(enableShortLivedTokens(), optedIn)
      guidError = new Error('Opted-in builds should not read the GUID')
      const fetch = t.mock.method(globalThis, 'fetch', async () => {
        throw new Error('Unexpected Central request')
      })

      for (const endpoint of [
        'https://api.github.com',
        'https://api.customer.ghe.com',
      ]) {
        assert.strictEqual(await checkRollout(endpoint), optedIn)
      }
      assert.strictEqual(
        await checkRollout('https://enterprise.example.com/api/v3'),
        false
      )
      assert.strictEqual(fetch.mock.callCount(), 0)
    })
  }

  for (const endpoint of [
    'https://api.github.com',
    'https://api.customer.ghe.com',
  ]) {
    for (const enabled of [false, true]) {
      it(`uses Central's ${enabled} decision for ${endpoint}`, async t => {
        const fetch = t.mock.method(
          globalThis,
          'fetch',
          async (input: RequestInfo | URL, init?: RequestInit) => {
            assert.ok(typeof input === 'string')
            const url = new URL(input)
            assert.strictEqual(
              url.origin + url.pathname,
              'https://central.github.com/api/features/desktop/desktop/short-lived-tokens'
            )
            assert.deepStrictEqual(
              [...url.searchParams],
              [
                ['guid', guid],
                ['version', getVersion()],
              ]
            )
            assert.strictEqual(init?.method, 'GET')
            assert.strictEqual(init.cache, 'no-store')
            assert.strictEqual(init.redirect, 'error')
            assert.strictEqual(init.credentials, 'omit')
            assert.strictEqual(
              new Headers(init.headers).get('Authorization'),
              null
            )
            assert.strictEqual(
              new Headers(init.headers).get('Accept'),
              'application/json'
            )
            assert.ok(init.signal)
            return Response.json({ enabled })
          }
        )
        assert.strictEqual(await checkRollout(endpoint), enabled)
        assert.strictEqual(fetch.mock.callCount(), 1)
      })
    }
  }

  it('skips Central for GitHub Enterprise Server', async t => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => {
      throw new Error('Unexpected Central request')
    })
    assert.strictEqual(
      await checkRollout('https://enterprise.example.com/api/v3'),
      false
    )
    assert.strictEqual(fetch.mock.callCount(), 0)
  })

  for (const value of [
    null,
    [],
    {},
    true,
    { enabled: 'true' },
    { enabled: 1 },
    { enabled: null },
  ]) {
    it(`logs and falls back for invalid response ${JSON.stringify(
      value
    )}`, async t => {
      t.mock.method(globalThis, 'fetch', async () => Response.json(value))
      const warn = t.mock.method(log, 'warn')
      assert.strictEqual(await checkRollout(), false)
      assert.strictEqual(warn.mock.callCount(), 1)
    })
  }

  for (const status of [400, 404, 500, 503]) {
    it(`logs and falls back for HTTP ${status}`, async t => {
      t.mock.method(globalThis, 'fetch', async () =>
        Response.json({ enabled: true }, { status })
      )
      const warn = t.mock.method(log, 'warn')
      assert.strictEqual(await checkRollout(), false)
      assert.strictEqual(warn.mock.callCount(), 1)
    })
  }

  it('logs and falls back for invalid JSON', async t => {
    t.mock.method(globalThis, 'fetch', async () => new Response('invalid'))
    const warn = t.mock.method(log, 'warn')
    assert.strictEqual(await checkRollout(), false)
    assert.strictEqual(warn.mock.callCount(), 1)
  })

  it('logs and falls back for network failure', async t => {
    t.mock.method(globalThis, 'fetch', async () => {
      throw new Error('Network unavailable')
    })
    const warn = t.mock.method(log, 'warn')
    assert.strictEqual(await checkRollout(), false)
    assert.strictEqual(warn.mock.callCount(), 1)
  })

  it('logs and falls back if the installation GUID cannot be read', async t => {
    guidError = new Error('GUID unavailable')
    const fetch = t.mock.method(globalThis, 'fetch', async () =>
      Response.json({ enabled: true })
    )
    const warn = t.mock.method(log, 'warn')
    assert.strictEqual(await checkRollout(), false)
    assert.strictEqual(fetch.mock.callCount(), 0)
    assert.strictEqual(warn.mock.callCount(), 1)
  })

  for (const stalledPhase of ['request', 'body']) {
    it(`falls back when the five-second timeout aborts the ${stalledPhase}`, async t => {
      const controller = new AbortController()
      const timeout = t.mock.method(AbortSignal, 'timeout', (delay: number) => {
        assert.strictEqual(delay, 5_000)
        return controller.signal
      })
      t.mock.method(
        globalThis,
        'fetch',
        async (_input: RequestInfo | URL, init?: RequestInit) => {
          const signal = init?.signal
          assert.strictEqual(signal, controller.signal)
          assert.ok(signal)
          const aborted = new Promise<never>((_, reject) =>
            signal.addEventListener('abort', () => reject(signal.reason), {
              once: true,
            })
          )
          if (stalledPhase === 'request') {
            return aborted
          }
          const response = Response.json({ enabled: true })
          t.mock.method(response, 'json', () => aborted)
          return response
        }
      )
      const warn = t.mock.method(log, 'warn')
      const pending = checkRollout()
      await setImmediate()
      assert.strictEqual(timeout.mock.callCount(), 1)
      assert.strictEqual(warn.mock.callCount(), 0)
      controller.abort(
        new DOMException('The operation timed out.', 'TimeoutError')
      )
      assert.strictEqual(await pending, false)
      assert.strictEqual(controller.signal.aborted, true)
      assert.strictEqual(warn.mock.callCount(), 1)
    })
  }
})
