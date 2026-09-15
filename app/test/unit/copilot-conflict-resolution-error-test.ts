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
      'Copilot Conflict Resolution Error: stage=stream-response, retryState=not-retried'
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
      'Copilot Conflict Resolution Error: stage=validate-response, retryState=failed-after-validation-retry'
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
})
