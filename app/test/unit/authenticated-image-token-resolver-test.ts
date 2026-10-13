import assert from 'node:assert'
import { EventEmitter } from 'node:events'
import { describe, it, mock } from 'node:test'
import { WebContents } from 'electron'
import { createAuthenticatedImageTokenResolver } from '../../src/main-process/authenticated-image-token-resolver'
import { addTrustedIPCSender } from '../../src/main-process/trusted-ipc-sender'

let nextWebContentsId = 1

function createRenderer(trusted = true) {
  const send = mock.fn()
  const events = new EventEmitter()
  const renderer = {
    id: nextWebContentsId++,
    isDestroyed: () => false,
    send,
    on: events.on.bind(events),
  } as unknown as WebContents
  if (trusted) {
    addTrustedIPCSender(renderer)
  }
  return { renderer, send, events }
}

describe('authenticated image token resolver', () => {
  it('correlates replies and rejects other trusted and untrusted senders', async () => {
    const { renderer, send } = createRenderer()
    const resolver = createAuthenticatedImageTokenResolver(() => renderer)
    const first = resolver.resolveToken('https://api.github.com', 'old-one')
    const second = resolver.resolveToken('https://api.github.com', 'old-two')
    assert.deepStrictEqual(send.mock.calls[0].arguments, [
      'resolve-image-token',
      0,
      'https://api.github.com',
      'old-one',
    ])
    resolver.acceptResponse(createRenderer().renderer, 0, 'wrong-window')
    resolver.acceptResponse(
      createRenderer(false).renderer,
      0,
      'untrusted-window'
    )
    resolver.acceptResponse(renderer, 42, 'unknown-request')
    resolver.acceptResponse(renderer, 1, 'fresh-two')
    resolver.acceptResponse(renderer, 0, 'fresh-one')
    assert.deepStrictEqual(await Promise.all([first, second]), [
      'fresh-one',
      'fresh-two',
    ])
  })

  it('bounds waiting and ignores late replies', async () => {
    const { renderer } = createRenderer()
    const resolver = createAuthenticatedImageTokenResolver(() => renderer, 1)
    await assert.rejects(
      resolver.resolveToken('endpoint', 'old-token'),
      /^Error: Image authentication unavailable$/
    )
    resolver.acceptResponse(renderer, 0, 'too-late')
    const next = resolver.resolveToken('endpoint', 'old-token')
    resolver.acceptResponse(renderer, 0, 'still-too-late')
    resolver.acceptResponse(renderer, 1, 'fresh-token')
    assert.strictEqual(await next, 'fresh-token')
  })

  it('rejects sanitized failures without a fallback token', async () => {
    const { renderer } = createRenderer()
    const resolver = createAuthenticatedImageTokenResolver(() => renderer)
    const result = resolver.resolveToken('endpoint', 'old-token')
    resolver.acceptResponse(renderer, 0, null)
    await assert.rejects(result, /^Error: Image authentication unavailable$/)
  })

  it('cancels pending requests and ignores their later responses', async () => {
    const { renderer } = createRenderer()
    const resolver = createAuthenticatedImageTokenResolver(() => renderer)
    const result = resolver.resolveToken('endpoint', 'old-token')
    resolver.updateAccounts([])
    resolver.acceptResponse(renderer, 0, 'stale-token')
    await assert.rejects(result, /^Error: Image authentication unavailable$/)
  })

  it('keeps pending requests across access token rotation', async () => {
    const { renderer } = createRenderer()
    const resolver = createAuthenticatedImageTokenResolver(() => renderer)
    const result = resolver.resolveToken('endpoint', 'old-token')
    resolver.updateAccounts([{ endpoint: 'endpoint', token: 'fresh-token' }])
    resolver.acceptResponse(renderer, 0, 'fresh-token')
    assert.strictEqual(await result, 'fresh-token')
  })

  it('ignores replies after the main renderer changes', async () => {
    const { renderer } = createRenderer()
    let current = renderer
    const resolver = createAuthenticatedImageTokenResolver(() => current, 1)
    const result = resolver.resolveToken('endpoint', 'old-token')
    current = createRenderer().renderer
    resolver.acceptResponse(renderer, 0, 'old-window-token')
    await assert.rejects(result, /^Error: Image authentication unavailable$/)
  })

  it('does not send credentials to an untrusted renderer', async () => {
    const { renderer, send } = createRenderer(false)
    const resolver = createAuthenticatedImageTokenResolver(() => renderer)
    await assert.rejects(
      resolver.resolveToken('endpoint', 'old-token'),
      /^Error: Image authentication unavailable$/
    )
    assert.strictEqual(send.mock.callCount(), 0)
  })

  it('does not accept replies from a destroyed renderer', async () => {
    const { renderer, events } = createRenderer()
    const resolver = createAuthenticatedImageTokenResolver(() => renderer, 1)
    const result = resolver.resolveToken('endpoint', 'old-token')
    events.emit('destroyed')
    resolver.acceptResponse(renderer, 0, 'old-window-token')
    await assert.rejects(result, /^Error: Image authentication unavailable$/)
  })
})
