import { describe, it } from 'node:test'
import assert from 'node:assert'
import { EventEmitter } from 'node:events'
import { installBrokenPipeErrorHandler } from '../../src/main-process/desktop-console-transport'

describe('DesktopConsoleTransport', () => {
  it('ignores EPIPE errors emitted by stdio streams', () => {
    const stream = new EventEmitter()
    installBrokenPipeErrorHandler(stream)

    const error = new Error('broken pipe')
    Object.defineProperty(error, 'code', { value: 'EPIPE' })

    assert.doesNotThrow(() => stream.emit('error', error))
  })

  it('throws non-EPIPE errors emitted by stdio streams', () => {
    const stream = new EventEmitter()
    installBrokenPipeErrorHandler(stream)

    const error = new Error('nope')
    Object.defineProperty(error, 'code', { value: 'EINVAL' })

    assert.throws(() => stream.emit('error', error), error)
  })
})
