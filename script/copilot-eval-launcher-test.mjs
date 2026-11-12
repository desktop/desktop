import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { it, mock } from 'node:test'

it('queues launcher cancellation until the worker is ready and never force-kills it', async t => {
  const child = Object.assign(new EventEmitter(), {
    connected: false,
    send: t.mock.fn(),
    kill: t.mock.fn(),
  })
  const spawn = t.mock.fn((_command, _args, options) => {
    child.connected = options.stdio.includes('ipc')
    return child
  })
  const replacement = mock.module('node:child_process', {
    namedExports: { spawn },
  })
  t.after(() => replacement.restore())
  const signals = ['SIGINT', 'SIGTERM']
  const previous = signals.map(signal => process.listeners(signal))
  const registered = []
  t.after(() => {
    registered.forEach(([signal, handler]) =>
      process.removeListener(signal, handler)
    )
  })
  await import('./copilot-eval.mjs')
  for (const [index, signal] of signals.entries()) {
    const handlers = process
      .listeners(signal)
      .filter(handler => !previous[index].includes(handler))
    assert.strictEqual(handlers.length, 1)
    registered.push([signal, handlers[0]])
  }
  registered[0][1]()
  assert.strictEqual(child.send.mock.callCount(), 0)
  child.emit('message', 'ready')
  assert.strictEqual(child.send.mock.callCount(), 1)
  assert.deepStrictEqual(child.send.mock.calls[0].arguments, ['cancel'])
  registered[1][1]()
  assert.strictEqual(child.send.mock.callCount(), 2)
  assert.strictEqual(child.kill.mock.callCount(), 0)
})
