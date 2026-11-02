import assert from 'node:assert'
import { describe, it } from 'node:test'

import { CopilotConflictResolutionError } from '../../src/lib/copilot-conflict-resolution-error'

describe('CopilotConflictResolutionError', () => {
  it('reports allowlisted SDK metadata while preserving the original error locally', () => {
    const original = Object.assign(new Error('secret /private/repository'), {
      errorType: 'rate_limit',
      statusCode: 429,
      errorCode: 'user_model_rate_limited',
      providerCallId: 'private-request-id',
    })
    const failure = new CopilotConflictResolutionError(
      original,
      'stream-response'
    )

    assert.strictEqual(
      failure.message,
      'Copilot Conflict Resolution Error: stage=stream-response, retryState=not-retried, type=rate_limit, status=429, code=user_model_rate_limited'
    )
    assert.strictEqual(failure.underlyingError, original)
    assert.strictEqual(failure.stage, 'stream-response')
    assert.strictEqual(failure.retryState, 'not-retried')
    assert.ok(!failure.stack?.includes('secret'))
    assert.ok(!failure.stack?.includes('private-request-id'))
    assert.strictEqual(failure.cause, undefined)
  })

  it('records a failed validation retry without interpreting private message text', () => {
    const failure = new CopilotConflictResolutionError(
      new Error('401 authentication rate_limit ETIMEDOUT'),
      'validate-response',
      'failed-after-validation-retry'
    )

    assert.strictEqual(
      failure.message,
      'Copilot Conflict Resolution Error: stage=validate-response, retryState=failed-after-validation-retry, type=unknown, status=unknown, code=unknown'
    )
    assert.strictEqual(failure.retryState, 'failed-after-validation-retry')
  })

  for (const errorType of [
    'authentication',
    'authorization',
    'policy',
    'quota',
    'rate_limit',
    'context_limit',
    'query',
  ]) {
    it(`preserves the SDK category ${errorType}`, () => {
      const failure = new CopilotConflictResolutionError(
        Object.assign(new Error('private details'), { errorType }),
        'stream-response'
      )
      assert.ok(failure.message.includes(`type=${errorType},`))
    })
  }

  for (const properties of [
    {
      errorType: 'secret',
      errorCode: 'secret',
      code: 'secret',
      statusCode: '401 secret',
    },
    { statusCode: 599, errorCode: 'unknown-provider-code' },
    { statusCode: '401', errorCode: 'ETIMEDOUT secret' },
    { statusCode: NaN },
    { code: -32603 },
  ]) {
    it(`omits unrecognized metadata ${JSON.stringify(properties)}`, () => {
      const failure = new CopilotConflictResolutionError(
        Object.assign(new Error('secret prompt'), properties),
        'create-session'
      )
      assert.strictEqual(
        failure.message,
        'Copilot Conflict Resolution Error: stage=create-session, retryState=not-retried, type=unknown, status=unknown, code=unknown'
      )
      assert.ok(!failure.stack?.includes('secret'))
    })
  }

  it('preserves the original diagnostic stack at propagation boundaries', () => {
    const failure = new CopilotConflictResolutionError(
      new Error('private details'),
      'create-client'
    )
    const stack = failure.stack
    const propagated =
      failure instanceof CopilotConflictResolutionError
        ? failure
        : new CopilotConflictResolutionError(failure, 'unknown')

    assert.strictEqual(propagated, failure)
    assert.strictEqual(propagated.stack, stack)
  })
})
