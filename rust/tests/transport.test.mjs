import assert from 'node:assert/strict'
import { test } from 'node:test'
import { connect } from '../web/transport.js'

class Socket {
  static OPEN = 1
  static instance
  readyState = 0
  sent = []
  constructor(url) {
    assert.equal(url, 'ws://127.0.0.1:1234/ws')
    Socket.instance = this
    queueMicrotask(() => {
      this.readyState = 1
      this.onopen()
    })
  }
  send(message) {
    this.sent.push(JSON.parse(message))
  }
  receive(message) {
    this.onmessage({ data: JSON.stringify(message) })
  }
  close(code = 1000) {
    if (this.readyState === 3) return
    this.readyState = 3
    this.onclose({ code })
  }
}

test('transport authenticates, correlates requests, forwards events, and rejects pending work on close', async () => {
  globalThis.location = { host: '127.0.0.1:1234' }
  globalThis.WebSocket = Socket
  const events = []
  const transport = connect('secret', event => events.push(event))
  const socket = Socket.instance
  await new Promise(resolve => queueMicrotask(resolve))
  assert.deepEqual(socket.sent, [{ token: 'secret' }])
  socket.receive({ ready: true, version: 2 })
  await transport.ready
  const first = transport.request('snapshot')
  const second = transport.request('stage', {
    paths: ['literal'],
    id: 999,
    method: 'bad',
  })
  await new Promise(resolve => queueMicrotask(resolve))
  assert.deepEqual(socket.sent.at(-1), {
    id: 2,
    method: 'stage',
    paths: ['literal'],
  })
  socket.receive({ event: 'repository_changed', snapshot: { branch: 'main' } })
  socket.receive({ id: 2, result: { code: 0 } })
  socket.receive({ id: 1, result: { files: [] } })
  assert.deepEqual(await first, { files: [] })
  assert.deepEqual(await second, { code: 0 })
  assert(events.some(event => event.event === 'repository_changed'))
  const failure = transport.request('commit', { summary: '' })
  await new Promise(resolve => queueMicrotask(resolve))
  socket.receive({ id: 3, error: 'invalid summary' })
  await assert.rejects(failure, /invalid summary/)
  const pending = transport.request('log')
  await new Promise(resolve => queueMicrotask(resolve))
  const rejection = assert.rejects(pending, /disconnected/)
  transport.close()
  await rejection
  assert.equal(events.at(-1).event, 'disconnected')
  await assert.rejects(transport.request('status'), /disconnected/)
})

const tick = () => new Promise(resolve => queueMicrotask(resolve))
function setup() {
  globalThis.location = { host: '127.0.0.1:1234' }
  globalThis.WebSocket = Socket
  return connect('secret')
}
async function authenticate(transport) {
  await tick()
  Socket.instance.receive({
    ready: true,
    version: 3,
    capabilities: { cancel: true },
  })
  await transport.ready
  return Socket.instance
}

test('AbortSignal and cancel-all wait for server cleanup and preserve typed cancellation errors', async () => {
  const transport = setup()
  const socket = await authenticate(transport)
  const aborted = new AbortController()
  aborted.abort()
  await assert.rejects(
    transport.request('stage', {}, { signal: aborted.signal }),
    { name: 'AbortError' }
  )
  assert.equal(socket.sent.length, 1)
  const controller = new AbortController()
  const request = transport.request(
    'commit',
    { summary: 'fixture' },
    { signal: controller.signal }
  )
  await tick()
  controller.abort()
  assert.deepEqual(socket.sent.at(-1), {
    id: 2,
    method: 'cancel',
    request_id: 1,
  })
  socket.receive({ id: 2, result: { request_id: 1, status: 'requested' } })
  let settled = false
  request.then(
    () => {
      settled = true
    },
    () => {
      settled = true
    }
  )
  await tick()
  assert.equal(
    settled,
    false,
    'the command must finish cleanup before the caller resumes'
  )
  socket.receive({
    id: 1,
    error: 'Operation cancelled; inspect state',
    error_code: 'cancelled',
  })
  await assert.rejects(request, { name: 'AbortError', code: 'cancelled' })
  const requests = [transport.request('stage'), transport.request('snapshot')]
  const results = Promise.allSettled(requests)
  await tick()
  const cancelled = transport.cancelPending()
  assert.deepEqual(socket.sent.slice(-2), [
    { id: 5, method: 'cancel', request_id: 3 },
    { id: 6, method: 'cancel', request_id: 4 },
  ])
  for (const id of [4, 3])
    socket.receive({
      id,
      error: 'Operation cancelled',
      error_code: 'cancelled',
    })
  assert.equal(await cancelled, 2)
  assert((await results).every(result => result.status === 'rejected'))
  transport.close()
})

test('reconnection reauthenticates without replaying a mutation or accepting old socket replies', async () => {
  const transport = setup()
  const first = await authenticate(transport)
  const mutation = transport.request('commit', { summary: 'never replay' })
  const failure = assert.rejects(mutation, { code: 'disconnected' })
  await tick()
  first.close(1006)
  await failure
  const waiting = transport.whenConnected()
  const reconnected = transport.reconnect()
  const second = await authenticate(transport)
  await reconnected
  await waiting
  assert.notEqual(first, second)
  assert.deepEqual(second.sent, [{ token: 'secret' }])
  const read = transport.request('snapshot')
  await tick()
  first.receive({ id: 2, result: 'stale' })
  second.receive({ id: 2, result: { branch: 'updated' } })
  assert.deepEqual(await read, { branch: 'updated' })
  transport.close()
})

test('initial recovery waits through transient failures and terminal auth failure stops retries', async () => {
  const transport = setup()
  const waiting = transport.whenConnected()
  await tick()
  Socket.instance.close(1006)
  transport.reconnect()
  await authenticate(transport)
  await waiting
  transport.close()
  const expired = setup()
  const denied = assert.rejects(expired.whenConnected(), /Session expired/)
  await tick()
  Socket.instance.close(1008)
  await denied
  await assert.rejects(expired.reconnect(), /new session URL/)
  expired.close()
})

test('pending work is bounded and serialization failures release their slot', async () => {
  const transport = setup()
  const socket = await authenticate(transport)
  await assert.rejects(transport.request('stage', { invalid: 1n }), /BigInt/)
  const requests = Array.from({ length: 32 }, () =>
    transport.request('snapshot')
  )
  const settled = Promise.allSettled(requests)
  await tick()
  await assert.rejects(transport.request('commit'), /Too many pending/)
  assert.equal(
    socket.sent.filter(message => message.method === 'snapshot').length,
    32
  )
  transport.close()
  assert((await settled).every(result => result.status === 'rejected'))
})

test('serialized UTF-8 request limits reject oversized inputs without dropping the session', async () => {
  const transport = setup()
  const socket = await authenticate(transport)
  const overhead = Buffer.byteLength(
    JSON.stringify({ body: '', id: 1, method: 'comment' })
  )
  const boundary = transport.request('comment', {
    body: 'x'.repeat(65536 - overhead),
  })
  await tick()
  assert.equal(socket.sent.at(-1).body.length, 65536 - overhead)
  socket.receive({ id: 1, result: { code: 0 } })
  await boundary
  await assert.rejects(
    transport.request('comment', { body: 'é'.repeat(32768) }),
    /64 KiB/
  )
  await assert.rejects(
    transport.request('comment', { body: '\x01'.repeat(11000) }),
    /64 KiB/
  )
  assert.equal(socket.sent.length, 2)
  const read = transport.request('snapshot')
  await tick()
  socket.receive({ id: 4, result: { branch: 'main' } })
  assert.deepEqual(await read, { branch: 'main' })
  transport.close()
})
