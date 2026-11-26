import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as Path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import {
  enableSourceMaps,
  mapSourceLocation,
  withSourceMappedStack,
} from '../../src/lib/source-map-support'
import { createTempDirectory } from '../helpers/temp'

describe('withSourceMappedStack', () => {
  it('preserves standard Error instances', () => {
    const original = new TypeError('something broke')
    const result = withSourceMappedStack(original)

    assert.strictEqual(result.name, 'TypeError')
    assert.strictEqual(result.message, 'something broke')
    assert.strictEqual(typeof result.stack, 'string')
    assert.ok(result.stack?.includes('something broke'))
  })

  it('wraps thrown strings as StringError', () => {
    const result = withSourceMappedStack('boom')

    assert.strictEqual(result.name, 'StringError')
    assert.strictEqual(result.message, 'boom')
    assert.strictEqual(result.stack, undefined)
  })

  it('preserves name, message, and stack on Error-like objects from other realms', () => {
    const errorLike = {
      name: 'RangeError',
      message: 'out of bounds',
      stack: 'RangeError: out of bounds\n    at foo (renderer.js:1:2)',
    }

    const result = withSourceMappedStack(errorLike)

    assert.strictEqual(result.name, 'RangeError')
    assert.strictEqual(result.message, 'out of bounds')
    assert.strictEqual(result.stack, errorLike.stack)
  })

  it('describes null and undefined instead of [Unknown]', () => {
    const nullResult = withSourceMappedStack(null)
    assert.strictEqual(nullResult.name, 'NonError')
    assert.strictEqual(nullResult.message, 'null')
    assert.strictEqual(nullResult.stack, undefined)

    const undefinedResult = withSourceMappedStack(undefined)
    assert.strictEqual(undefinedResult.name, 'NonError')
    assert.strictEqual(undefinedResult.message, 'undefined')
    assert.strictEqual(undefinedResult.stack, undefined)
  })

  it('describes primitive values and functions safely', () => {
    assert.deepStrictEqual(withSourceMappedStack(42), {
      name: 'NonError',
      message: 'number: 42',
      stack: undefined,
    })

    assert.deepStrictEqual(withSourceMappedStack(false), {
      name: 'NonError',
      message: 'boolean: false',
      stack: undefined,
    })

    assert.deepStrictEqual(withSourceMappedStack(BigInt(9)), {
      name: 'NonError',
      message: 'bigint: 9',
      stack: undefined,
    })

    assert.deepStrictEqual(withSourceMappedStack(Symbol('oops')), {
      name: 'NonError',
      message: 'symbol: Symbol(oops)',
      stack: undefined,
    })

    function myCallback() {}
    assert.deepStrictEqual(withSourceMappedStack(myCallback), {
      name: 'NonError',
      message: 'function myCallback',
      stack: undefined,
    })

    assert.deepStrictEqual(
      withSourceMappedStack(() => {}),
      {
        name: 'NonError',
        message: 'anonymous function',
        stack: undefined,
      }
    )
  })

  it('does not throw when a thrown function has a throwing or non-string name', () => {
    const throwingNameFn = function () {}
    Object.defineProperty(throwingNameFn, 'name', {
      get() {
        throw new Error('name getter failed')
      },
    })

    assert.deepStrictEqual(withSourceMappedStack(throwingNameFn), {
      name: 'NonError',
      message: 'anonymous function',
      stack: undefined,
    })

    const nullNameFn = function () {}
    Object.defineProperty(nullNameFn, 'name', { value: null })

    assert.deepStrictEqual(withSourceMappedStack(nullNameFn), {
      name: 'NonError',
      message: 'anonymous function',
      stack: undefined,
    })
  })

  it('describes DOM Event objects with their constructor and event type', () => {
    const event = new Event('error')
    const result = withSourceMappedStack(event)

    assert.strictEqual(result.name, 'Event')
    assert.strictEqual(result.message, 'Event (type=error)')
    assert.strictEqual(result.stack, undefined)
  })

  it('describes plain objects without message using sorted keys only, omitting values', () => {
    const result = withSourceMappedStack({
      token: 'ghp_secret_value',
      code: 'ENOENT',
    })

    assert.strictEqual(result.name, 'Object')
    assert.strictEqual(result.message, 'Object (keys: code, token)')
    assert.ok(!result.message.includes('ghp_secret_value'))
    assert.ok(!result.message.includes('ENOENT'))
  })

  it('describes empty objects and null-prototype objects without throwing', () => {
    assert.deepStrictEqual(withSourceMappedStack({}), {
      name: 'Object',
      message: 'Object (no own properties)',
      stack: undefined,
    })

    const nullProto = Object.create(null)
    nullProto.status = 500
    assert.deepStrictEqual(withSourceMappedStack(nullProto), {
      name: 'NonError',
      message: '[null prototype] (keys: status)',
      stack: undefined,
    })

    assert.deepStrictEqual(withSourceMappedStack(Object.create(null)), {
      name: 'NonError',
      message: '[null prototype] (no own properties)',
      stack: undefined,
    })
  })

  it('handles non-string and circular message properties safely', () => {
    assert.strictEqual(withSourceMappedStack({ message: null }).message, 'null')
    assert.strictEqual(
      withSourceMappedStack({ message: undefined }).message,
      'undefined'
    )
    assert.strictEqual(
      withSourceMappedStack({ message: { detail: 'x' } }).message,
      '{"detail":"x"}'
    )
    assert.strictEqual(withSourceMappedStack({ message: 123 }).message, '123')

    const circular: Record<string, unknown> = {}
    circular.self = circular
    const result = withSourceMappedStack({
      name: 'WeirdError',
      message: circular,
    })
    assert.strictEqual(result.name, 'WeirdError')
    assert.strictEqual(result.message, 'Object (keys: self)')
  })

  it('does not throw when getters on the thrown object throw', () => {
    const hostile = Object.defineProperties(
      {},
      {
        name: {
          get() {
            throw new Error('name getter failed')
          },
        },
        message: {
          get() {
            throw new Error('message getter failed')
          },
        },
      }
    )

    const result = withSourceMappedStack(hostile)
    assert.strictEqual(result.name, 'Object')
    assert.strictEqual(result.message, 'Object (keys: message, name)')
    assert.strictEqual(result.stack, undefined)
  })

  it('ignores non-string constructor names on thrown objects', () => {
    function CustomError() {}
    Object.defineProperty(CustomError, 'name', { value: ['CustomError'] })
    const instance = Object.create(CustomError.prototype)

    const result = withSourceMappedStack(instance)
    assert.strictEqual(result.name, 'NonError')
    assert.strictEqual(result.message, '[null prototype] (no own properties)')
    assert.strictEqual(result.stack, undefined)
  })
})

describe('mapSourceLocation', () => {
  it('preserves 1-based line and column when no source map exists', () => {
    assert.deepStrictEqual(
      mapSourceLocation('file:///app/unmapped.js', 19, 24),
      {
        source: 'file:///app/unmapped.js',
        line: 19,
        column: 24,
      }
    )

    assert.deepStrictEqual(
      mapSourceLocation('file:///app/unmapped.js', 19, 0),
      {
        source: 'file:///app/unmapped.js',
        line: 19,
        column: undefined,
      }
    )

    assert.deepStrictEqual(mapSourceLocation('file:///app/unmapped.js', 19), {
      source: 'file:///app/unmapped.js',
      line: 19,
      column: undefined,
    })
  })

  it('maps 1-based generated positions through a real renderer.js source map', async t => {
    const originalPrepareStackTrace = Error.prepareStackTrace
    t.after(() => {
      Error.prepareStackTrace = originalPrepareStackTrace
    })

    const dir = await createTempDirectory(t)
    const bundlePath = Path.join(dir, 'renderer.js')
    const mapPath = `${bundlePath}.map`

    // Maps 0-based generated (line 1, col 9) -> original (line 42, col 6),
    // which corresponds to 1-based (1, 10) -> (42, 7).
    const sourceMap = JSON.stringify({
      version: 3,
      sources: ['webpack:///app/src/ui/example.tsx'],
      names: [],
      mappings: 'SAyCM',
      file: 'renderer.js',
    })

    await writeFile(bundlePath, 'console.log("test")\n', 'utf8')
    await writeFile(mapPath, sourceMap, 'utf8')

    enableSourceMaps()

    const mapped = mapSourceLocation(pathToFileURL(bundlePath).href, 1, 10)
    assert.ok(
      mapped.source
        .replace(/\\/g, '/')
        .endsWith('webpack:/app/src/ui/example.tsx'),
      `unexpected mapped source: ${mapped.source}`
    )
    assert.strictEqual(mapped.line, 42)
    assert.strictEqual(mapped.column, 7)
  })
})
