import assert from 'node:assert'
import { describe, it, mock } from 'node:test'
import { installAuthenticatedImageTokenHandler } from '../../src/lib/authenticated-image-token-handler'
import { MockIPC } from '../helpers/mock-ipc'

describe('authenticated image token handler', () => {
  it('returns the resolved access token with its request id', async () => {
    const ipc = new MockIPC()
    const resolveToken = mock.fn(async () => 'fresh-token')
    const dispose = installAuthenticatedImageTokenHandler({ resolveToken }, ipc)
    ipc.emit('resolve-image-token', 12, 'endpoint', 'old-token')
    await Promise.resolve()
    assert.deepStrictEqual(resolveToken.mock.calls[0].arguments, [
      'endpoint',
      'old-token',
    ])
    assert.deepStrictEqual(ipc.sends, [
      { channel: 'resolved-image-token', args: [12, 'fresh-token'] },
    ])
    dispose()
  })

  it('sends failure without exposing token-bearing errors', async t => {
    const ipc = new MockIPC()
    const warning = t.mock.method(log, 'warn')
    const dispose = installAuthenticatedImageTokenHandler(
      {
        resolveToken: async () => {
          throw new Error('secret refresh token')
        },
      },
      ipc
    )
    ipc.emit('resolve-image-token', 12, 'endpoint', 'old-token')
    await Promise.resolve()
    assert.deepStrictEqual(ipc.sends, [
      { channel: 'resolved-image-token', args: [12, null] },
    ])
    assert.deepStrictEqual(warning.mock.calls[0].arguments, [
      'Unable to resolve authentication for a private image',
    ])
    dispose()
  })

  it('removes the listener and drops replies when disposed', async () => {
    const ipc = new MockIPC()
    let finish: (token: string) => void = () => {}
    const resolveToken = mock.fn(
      () =>
        new Promise<string>(resolve => {
          finish = resolve
        })
    )
    const dispose = installAuthenticatedImageTokenHandler({ resolveToken }, ipc)
    ipc.emit('resolve-image-token', 12, 'endpoint', 'old-token')
    dispose()
    finish('fresh-token')
    await Promise.resolve()
    ipc.emit('resolve-image-token', 13, 'endpoint', 'old-token')
    assert.deepStrictEqual(ipc.sends, [])
    assert.strictEqual(resolveToken.mock.callCount(), 1)
  })
})
