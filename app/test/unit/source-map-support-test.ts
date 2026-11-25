import { describe, it } from 'node:test'
import assert from 'node:assert'
import { withSourceMappedStack } from '../../src/lib/source-map-support'

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
})
