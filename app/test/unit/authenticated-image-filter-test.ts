import assert from 'node:assert'
import { describe, it, mock } from 'node:test'
import {
  BeforeSendResponse,
  OnBeforeSendHeadersListenerDetails,
  WebRequest,
} from 'electron'
import { installAuthenticatedImageFilter } from '../../src/main-process/authenticated-image-filter'
import { OrderedWebRequest } from '../../src/main-process/ordered-webrequest'

function createWebRequest() {
  let listener:
    | ((
        details: OnBeforeSendHeadersListenerDetails,
        callback: (response: BeforeSendResponse) => void
      ) => void)
    | null = null
  const webRequest = {
    onBeforeRedirect() {},
    onBeforeRequest() {},
    onBeforeSendHeaders(value: typeof listener) {
      listener = value
    },
    onCompleted() {},
    onErrorOccurred() {},
    onHeadersReceived() {},
    onResponseStarted() {},
    onSendHeaders() {},
  } as unknown as WebRequest
  const ordered = new OrderedWebRequest(webRequest)

  return {
    ordered,
    request: (url: string) =>
      new Promise<BeforeSendResponse>(resolve => {
        assert.ok(listener)
        listener(
          {
            id: 1,
            url,
            method: 'GET',
            resourceType: 'image',
            referrer: '',
            timestamp: 0,
            requestHeaders: { Accept: 'image/png' },
          },
          resolve
        )
      }),
  }
}

describe('authenticated image filter', () => {
  for (const url of [
    'https://github.com/owner/repo/assets/user/image',
    'https://github.com/user-attachments/assets/image',
    'https://enterprise.example/api/v3/enterprise/avatars/user',
    'https://enterprise.example/owner/repo/assets/user/image',
  ]) {
    it(`resolves a fresh token before authorizing ${url}`, async () => {
      const { ordered, request } = createWebRequest()
      const resolver = mock.fn(async () => 'fresh-access-token')
      const updateAccounts = installAuthenticatedImageFilter(ordered, resolver)
      updateAccounts([
        { endpoint: 'https://api.github.com', token: 'old-access-token' },
        {
          endpoint: 'https://enterprise.example/api/v3',
          token: 'old-access-token',
        },
      ])

      const response = await request(url)
      assert.deepStrictEqual(response.requestHeaders, {
        Accept: 'image/png',
        Authorization: 'token fresh-access-token',
      })
      assert.deepStrictEqual(resolver.mock.calls[0].arguments, [
        url.includes('enterprise.example')
          ? 'https://enterprise.example/api/v3'
          : 'https://api.github.com',
        'old-access-token',
      ])
    })
  }

  for (const url of [
    'https://other.example/user-attachments/assets/image',
    'https://github.com/not-an-asset',
    'http://github.com/user-attachments/assets/image',
    'https://github.com.evil.example/user-attachments/assets/image',
    'https://github.com/user-attachments/assets/image/extra',
  ]) {
    it(`does not resolve or attach credentials to ${url}`, async () => {
      const { ordered, request } = createWebRequest()
      const resolver = mock.fn(async () => 'fresh-access-token')
      installAuthenticatedImageFilter(
        ordered,
        resolver
      )([{ endpoint: 'https://api.github.com', token: 'old-access-token' }])
      const response = await request(url)
      assert.strictEqual(resolver.mock.callCount(), 0)
      assert.deepStrictEqual(response.requestHeaders, { Accept: 'image/png' })
    })
  }

  it('does not resolve credentials when signed out', async () => {
    const { ordered, request } = createWebRequest()
    const resolver = mock.fn(async () => 'fresh-access-token')
    installAuthenticatedImageFilter(ordered, resolver)
    const response = await request(
      'https://github.com/user-attachments/assets/image'
    )
    assert.strictEqual(resolver.mock.callCount(), 0)
    assert.deepStrictEqual(response.requestHeaders, { Accept: 'image/png' })
  })

  it('cancels failed resolution without using the snapshot token', async () => {
    const { ordered, request } = createWebRequest()
    installAuthenticatedImageFilter(ordered, async () => {
      throw new Error('refresh failed')
    })([{ endpoint: 'https://api.github.com', token: 'old-access-token' }])
    const laterFilter = mock.fn(async () => ({}))
    ordered.onBeforeSendHeaders.addEventListener(laterFilter)
    assert.deepStrictEqual(
      await request('https://github.com/user-attachments/assets/image'),
      { cancel: true }
    )
    assert.strictEqual(laterFilter.mock.callCount(), 0)
  })

  for (const token of [null, 'replacement-access-token']) {
    it(`cancels pending resolution after accounts change to ${token}`, async () => {
      const { ordered, request } = createWebRequest()
      let finish: (token: string) => void = () => {}
      const updateAccounts = installAuthenticatedImageFilter(
        ordered,
        () =>
          new Promise(resolve => {
            finish = resolve
          })
      )
      updateAccounts([
        { endpoint: 'https://api.github.com', token: 'old-access-token' },
      ])
      const response = request(
        'https://github.com/user-attachments/assets/image'
      )
      updateAccounts(
        token === null ? [] : [{ endpoint: 'https://api.github.com', token }]
      )
      finish('fresh-access-token')
      assert.deepStrictEqual(await response, { cancel: true })
    })
  }

  it('accepts a refreshed token published by update-accounts before its reply', async () => {
    const { ordered, request } = createWebRequest()
    const updateAccounts = installAuthenticatedImageFilter(
      ordered,
      async () => {
        updateAccounts([
          { endpoint: 'https://api.github.com', token: 'fresh-access-token' },
        ])
        return 'fresh-access-token'
      }
    )
    updateAccounts([
      { endpoint: 'https://api.github.com', token: 'old-access-token' },
    ])
    const response = await request(
      'https://github.com/user-attachments/assets/image'
    )
    assert.deepStrictEqual(response.requestHeaders, {
      Accept: 'image/png',
      Authorization: 'token fresh-access-token',
    })
  })

  it('rejects a reply after signout and reauthentication even if tokens match', async () => {
    const { ordered, request } = createWebRequest()
    const updateAccounts = installAuthenticatedImageFilter(
      ordered,
      async () => {
        updateAccounts([])
        updateAccounts([
          { endpoint: 'https://api.github.com', token: 'fresh-access-token' },
        ])
        return 'fresh-access-token'
      }
    )
    updateAccounts([
      { endpoint: 'https://api.github.com', token: 'old-access-token' },
    ])
    assert.deepStrictEqual(
      await request('https://github.com/user-attachments/assets/image'),
      { cancel: true }
    )
  })

  it('preserves a pending request across unrelated account updates', async () => {
    const { ordered, request } = createWebRequest()
    const updateAccounts = installAuthenticatedImageFilter(
      ordered,
      async () => {
        updateAccounts([
          { endpoint: 'https://api.github.com', token: 'old-access-token' },
          { endpoint: 'https://enterprise.example', token: 'other-token' },
        ])
        return 'fresh-access-token'
      }
    )
    updateAccounts([
      { endpoint: 'https://api.github.com', token: 'old-access-token' },
    ])
    const response = await request(
      'https://github.com/user-attachments/assets/image'
    )
    assert.strictEqual(
      response.requestHeaders?.Authorization,
      'token fresh-access-token'
    )
  })

  it('propagates cancellation through the Electron callback', async () => {
    const { ordered, request } = createWebRequest()
    ordered.onBeforeSendHeaders.addEventListener(async () => ({
      cancel: true,
    }))
    const laterFilter = mock.fn(async () => ({}))
    ordered.onBeforeSendHeaders.addEventListener(laterFilter)
    assert.deepStrictEqual(await request('https://example.com/image'), {
      cancel: true,
    })
    assert.strictEqual(laterFilter.mock.callCount(), 0)
  })
})
