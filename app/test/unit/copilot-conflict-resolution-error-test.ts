import assert from 'node:assert'
import { describe, it } from 'node:test'

import { CopilotConflictResolutionError } from '../../src/lib/copilot-conflict-resolution-error'

describe('CopilotConflictResolutionError', () => {
  it('creates a sanitized failure with stable metadata', () => {
    const original = new Error(
      'Provider rejected secret for repository /private/repository'
    )
    const failure = new CopilotConflictResolutionError(
      original,
      'stream-response'
    )

    assert.ok(failure instanceof CopilotConflictResolutionError)
    assert.strictEqual(
      failure.message,
      'Copilot Conflict Resolution Error: stage=stream-response, retryState=not-retried, reason=unknown, status=unknown, code=unknown, elapsed=unknown'
    )
    assert.strictEqual(failure.stage, 'stream-response')
    assert.strictEqual(failure.retryState, 'not-retried')
    assert.strictEqual(failure.underlyingError, original)
    assert.ok(!failure.message.includes('/private/repository'))
  })

  it('records a failed validation retry', () => {
    const failure = new CopilotConflictResolutionError(
      new Error('Invalid response'),
      'validate-response',
      'failed-after-validation-retry'
    )

    assert.strictEqual(failure.stage, 'validate-response')
    assert.strictEqual(failure.retryState, 'failed-after-validation-retry')
    assert.strictEqual(
      failure.message,
      'Copilot Conflict Resolution Error: stage=validate-response, retryState=failed-after-validation-retry, reason=unknown, status=unknown, code=unknown, elapsed=unknown'
    )
  })

  it('preserves existing structured failures at propagation boundaries', () => {
    const failure = new CopilotConflictResolutionError(
      new Error('Client failed'),
      'create-client'
    )
    const propagated =
      failure instanceof CopilotConflictResolutionError
        ? failure
        : new CopilotConflictResolutionError(failure, 'unknown')

    assert.strictEqual(propagated, failure)
  })

  for (const [properties, reason] of [
    [{ statusCode: 401 }, 'authentication'],
    [{ errorType: 'authentication' }, 'authentication'],
    [{ statusCode: 403 }, 'authorization'],
    [{ errorType: 'authorization' }, 'authorization'],
    [{ statusCode: 429 }, 'rate-limit'],
    [{ errorType: 'rate_limit' }, 'rate-limit'],
    [{ errorCode: 'user_weekly_rate_limited' }, 'rate-limit'],
    [{ statusCode: 402 }, 'quota'],
    [{ errorType: 'quota' }, 'quota'],
    [{ errorCode: 'billing_not_configured' }, 'quota'],
    [{ statusCode: 503 }, 'service'],
    [{ statusCode: 408 }, 'timeout'],
    [{ statusCode: 504 }, 'timeout'],
    [{ code: 'ETIMEDOUT' }, 'timeout'],
    [{ code: 'ECONNRESET' }, 'connection'],
    [{ code: 'ECONNREFUSED' }, 'connection'],
    [{ code: 'ENOTFOUND' }, 'connection'],
    [{ code: 'EAI_AGAIN' }, 'connection'],
    [{ code: 'EPIPE' }, 'connection'],
    [{ code: 'COPILOT_EMPTY_RESPONSE' }, 'empty-response'],
    [{ statusCode: 400 }, 'unknown'],
  ] as const) {
    it(`classifies ${JSON.stringify(properties)} as ${reason}`, () => {
      const error = Object.assign(new Error('private details'), properties)
      const failure = new CopilotConflictResolutionError(
        error,
        'stream-response'
      )

      assert.ok(failure.message.includes(`reason=${reason},`))
      assert.ok(!failure.message.includes('private details'))
    })
  }

  it('only reports allowlisted status and error codes', () => {
    const error = Object.assign(new Error('private prompt'), {
      statusCode: 429,
      errorCode: 'user_model_rate_limited',
    })
    const failure = new CopilotConflictResolutionError(error, 'stream-response')

    assert.ok(
      failure.message.includes(
        'reason=rate-limit, status=429, code=user_model_rate_limited'
      )
    )
    assert.strictEqual(failure.underlyingError, error)
  })

  for (const properties of [
    {
      errorType: 'secret /private/repository',
      errorCode: 'secret /private/repository',
      code: 'secret /private/repository',
      statusCode: '401 secret',
    },
    { statusCode: 599, errorCode: 'unknown-provider-code' },
    { statusCode: '401', errorCode: 'ETIMEDOUT secret' },
    { statusCode: NaN },
  ]) {
    it(`does not report arbitrary metadata ${JSON.stringify(
      properties
    )}`, () => {
      const error = Object.assign(new Error('secret prompt'), properties)
      const failure = new CopilotConflictResolutionError(
        error,
        'create-session'
      )

      assert.strictEqual(
        failure.message,
        'Copilot Conflict Resolution Error: stage=create-session, retryState=not-retried, reason=unknown, status=unknown, code=unknown, elapsed=unknown'
      )
      assert.ok(!failure.stack?.includes('secret'))
      assert.strictEqual(failure.cause, undefined)
    })
  }

  it('does not classify errors by matching private message text', () => {
    const failure = new CopilotConflictResolutionError(
      new Error('401 authentication rate_limit ETIMEDOUT'),
      'stream-response'
    )

    assert.ok(failure.message.includes('reason=unknown,'))
  })

  it('preserves sanitized metadata and the original error when adding flow timing', () => {
    const original = Object.assign(new Error('private details'), {
      errorType: 'rate_limit',
      statusCode: 429,
      errorCode: 'rate_limited',
    })
    const failure = new CopilotConflictResolutionError(
      original,
      'stream-response'
    )
    const report = new CopilotConflictResolutionError(
      failure,
      failure.stage,
      failure.retryState,
      5_000
    )

    assert.strictEqual(
      report.message,
      'Copilot Conflict Resolution Error: stage=stream-response, retryState=not-retried, reason=rate-limit, status=429, code=rate_limited, elapsed=5s-to-30s'
    )
    assert.strictEqual(report.underlyingError, original)
    assert.strictEqual(report.cause, undefined)
  })

  it('preserves classification of non-Error SDK rejections when adding timing', () => {
    const failure = new CopilotConflictResolutionError(
      { errorType: 'authentication' },
      'create-session'
    )
    const report = new CopilotConflictResolutionError(
      failure,
      failure.stage,
      failure.retryState,
      100
    )

    assert.ok(report.message.includes('reason=authentication,'))
    assert.ok(report.message.endsWith('elapsed=under-5s'))
  })

  for (const [elapsedMs, bucket] of [
    [undefined, 'unknown'],
    [-1, 'unknown'],
    [NaN, 'unknown'],
    [Infinity, 'unknown'],
    [0, 'under-5s'],
    [4_999, 'under-5s'],
    [5_000, '5s-to-30s'],
    [29_999, '5s-to-30s'],
    [30_000, '30s-to-120s'],
    [119_999, '30s-to-120s'],
    [120_000, '120s-to-600s'],
    [599_999, '120s-to-600s'],
    [600_000, '600s-or-more'],
  ] as const) {
    it(`buckets elapsed duration ${elapsedMs} as ${bucket}`, () => {
      const failure = new CopilotConflictResolutionError(
        new Error('private details'),
        'stream-response',
        'not-retried',
        elapsedMs
      )

      assert.ok(failure.message.endsWith(`elapsed=${bucket}`))
    })
  }
})
