import assert from 'node:assert/strict'
import { it } from 'node:test'
import type {
  OnBeforeSendHeadersListenerDetails,
  BeforeSendResponse,
} from 'electron/main'
import { installAuthenticatedImageFilter } from '../../../src/main-process/authenticated-image-filter'

it('routes private repository assets without leaking identities across hosts or signed-out bindings', async () => {
  let listener:
    | ((
        details: OnBeforeSendHeadersListenerDetails
      ) => Promise<BeforeSendResponse>)
    | undefined
  const update = installAuthenticatedImageFilter({
    onBeforeSendHeaders: {
      addEventListener: callback => {
        listener = callback
      },
    },
  })
  const getHeaders = async (url: string) => {
    assert.ok(listener)
    return listener({
      id: 1,
      url,
      method: 'GET',
      resourceType: 'image',
      referrer: '',
      timestamp: 0,
      requestHeaders: {},
    })
  }
  update([
    { endpoint: 'https://api.github.com', token: 'fake-default' },
    { endpoint: 'https://api.github.com', token: 'fake-second' },
    {
      endpoint: 'https://api.github.com',
      token: 'fake-second',
      repositoryURL: 'https://github.com/owner/private',
    },
    {
      endpoint: 'https://api.github.com',
      token: '',
      repositoryURL: 'https://github.com/owner/signed-out',
    },
  ])
  assert.equal(
    (await getHeaders('https://github.com/owner/private/assets/1/image'))
      .requestHeaders?.Authorization,
    'token fake-second'
  )
  assert.equal(
    (await getHeaders('https://github.com/owner/other/assets/1/image'))
      .requestHeaders?.Authorization,
    'token fake-default'
  )
  assert.deepEqual(
    await getHeaders('https://github.com/owner/signed-out/assets/1/image'),
    {}
  )
  assert.deepEqual(
    await getHeaders('https://example.com/owner/private/assets/1/image'),
    {}
  )
  assert.deepEqual(
    await getHeaders('http://github.com/owner/private/assets/1/image'),
    {}
  )
  assert.deepEqual(
    await getHeaders('https://github.com/owner/private/unrelated'),
    {}
  )
  update([])
  assert.deepEqual(
    await getHeaders('https://github.com/owner/private/assets/1/image'),
    {}
  )
})
