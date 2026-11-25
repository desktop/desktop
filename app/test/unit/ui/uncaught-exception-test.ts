import { describe, it } from 'node:test'
import assert from 'node:assert'
import { EventEmitter } from 'node:events'
import {
  installWindowErrorHandler,
  isResizeObserverLoopError,
  normalizeWindowError,
} from '../../../src/ui/lib/uncaught-exception'
import { withSourceMappedStack } from '../../../src/lib/source-map-support'

describe('uncaught-exception', () => {
  describe('isResizeObserverLoopError', () => {
    it('matches Chromium ResizeObserver loop messages as strings or errors', () => {
      assert.strictEqual(
        isResizeObserverLoopError(
          'ResizeObserver loop completed with undelivered notifications.'
        ),
        true
      )
      assert.strictEqual(
        isResizeObserverLoopError(
          new Error(
            'ResizeObserver loop completed with undelivered notifications.'
          )
        ),
        true
      )
      assert.strictEqual(
        isResizeObserverLoopError(
          new Error('ResizeObserver loop limit exceeded')
        ),
        true
      )
    })

    it('rejects null, undefined, and unrelated errors', () => {
      assert.strictEqual(isResizeObserverLoopError(null), false)
      assert.strictEqual(isResizeObserverLoopError(undefined), false)
      assert.strictEqual(isResizeObserverLoopError(new Error('other')), false)
    })
  })

  describe('normalizeWindowError', () => {
    it('returns real Error instances unchanged', () => {
      const original = new TypeError('boom')
      const result = normalizeWindowError(
        'Uncaught TypeError: boom',
        'file:///app/renderer.js',
        10,
        20,
        original
      )

      assert.strictEqual(result, original)
    })

    it('preserves ResizeObserver loop message when Chromium passes error === null', () => {
      const result = normalizeWindowError(
        'ResizeObserver loop completed with undelivered notifications.',
        'file:///app/index.html',
        0,
        0,
        null
      )

      assert.strictEqual(result.name, 'Error')
      assert.strictEqual(
        result.message,
        'ResizeObserver loop completed with undelivered notifications.'
      )
      assert.strictEqual(result.stack, undefined)
      assert.strictEqual(isResizeObserverLoopError(result), true)

      const mapped = withSourceMappedStack(result)
      assert.strictEqual(mapped.name, 'Error')
      assert.strictEqual(mapped.message, result.message)
      assert.strictEqual(mapped.stack, undefined)
    })

    it('maps bundle location into a stack frame when error is null or undefined', () => {
      const result = normalizeWindowError(
        'Uncaught null',
        'file:///app/renderer.js',
        19,
        24,
        null,
        (source, line, column) => {
          assert.strictEqual(source, 'file:///app/renderer.js')
          assert.strictEqual(line, 19)
          assert.strictEqual(column, 24)
          return {
            source: 'webpack:///app/src/ui/app.tsx',
            line: 42,
            column: 7,
          }
        }
      )

      assert.strictEqual(result.name, 'Error')
      assert.strictEqual(result.message, 'Uncaught null')
      assert.strictEqual(
        result.stack,
        'Error: Uncaught null\n    at webpack:///app/src/ui/app.tsx:42:7'
      )

      const mapped = withSourceMappedStack(result)
      assert.strictEqual(mapped.stack, result.stack)
    })

    it('omits column when colno is 0 or undefined', () => {
      const result = normalizeWindowError(
        'Uncaught undefined',
        'file:///app/renderer.js',
        19,
        0,
        undefined,
        (source, line) => ({ source, line })
      )

      assert.strictEqual(
        result.stack,
        'Error: Uncaught undefined\n    at file:///app/renderer.js:19'
      )
    })

    it('attaches mapped location to thrown non-Error objects and strings', () => {
      const objectError = normalizeWindowError(
        'Uncaught [object Object]',
        'file:///app/renderer.js',
        21,
        24,
        { token: 'secret', code: 500 },
        () => ({ source: 'webpack:///app/src/lib/api.ts', line: 88, column: 5 })
      )

      assert.strictEqual(objectError.name, 'Object')
      assert.strictEqual(objectError.message, 'Object (keys: code, token)')
      assert.strictEqual(
        objectError.stack,
        'Object: Object (keys: code, token)\n    at webpack:///app/src/lib/api.ts:88:5'
      )

      const stringError = normalizeWindowError(
        'Uncaught hello',
        'file:///app/renderer.js',
        23,
        24,
        'hello',
        () => ({ source: 'webpack:///app/src/ui/foo.ts', line: 12, column: 3 })
      )

      assert.strictEqual(stringError.name, 'StringError')
      assert.strictEqual(stringError.message, 'hello')
      assert.strictEqual(
        stringError.stack,
        'StringError: hello\n    at webpack:///app/src/ui/foo.ts:12:3'
      )
    })

    it('falls back to NonError when both error and message are empty', () => {
      const result = normalizeWindowError('', '', 0, 0, null)

      assert.strictEqual(result.name, 'NonError')
      assert.strictEqual(result.message, 'null')
      assert.strictEqual(result.stack, undefined)
    })
  })

  describe('installWindowErrorHandler', () => {
    it('emits normalized errors when uncaughtException listeners exist', () => {
      const fakeWindow: Pick<Window, 'onerror'> = { onerror: null }
      const fakeProcess = new EventEmitter()
      const received: Array<unknown> = []

      fakeProcess.on('uncaughtException', error => received.push(error))
      installWindowErrorHandler(fakeWindow, fakeProcess)

      assert.ok(fakeWindow.onerror !== null)
      const handled = fakeWindow.onerror(
        'ResizeObserver loop completed with undelivered notifications.',
        'file:///app/index.html',
        0,
        0,
        undefined
      )

      assert.strictEqual(handled, true)
      assert.strictEqual(received.length, 1)
      assert.strictEqual(isResizeObserverLoopError(received[0]), true)
    })

    it('returns false without emitting when no uncaughtException listeners exist', () => {
      const fakeWindow: Pick<Window, 'onerror'> = { onerror: null }
      const fakeProcess = new EventEmitter()

      installWindowErrorHandler(fakeWindow, fakeProcess)

      assert.ok(fakeWindow.onerror !== null)
      const handled = fakeWindow.onerror(
        'Uncaught null',
        'file:///app/renderer.js',
        10,
        5,
        undefined
      )

      assert.strictEqual(handled, false)
    })
  })
})
