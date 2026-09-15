import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  CopilotConflictResolutionError,
  createCopilotConflictResolutionError,
} from '../../src/lib/copilot-conflict-resolution-error'

describe('createCopilotConflictResolutionError', () => {
  it('creates a sanitized failure with stable metadata', () => {
    const original = new Error(
      'Provider rejected secret for repository /private/repository'
    )
    const failure = createCopilotConflictResolutionError(
      original,
      'stream-response'
    )

    assert.ok(failure instanceof CopilotConflictResolutionError)
    assert.strictEqual(
      failure.message,
      'Copilot conflict resolution failed during stream-response'
    )
    assert.strictEqual(failure.stage, 'stream-response')
    assert.strictEqual(failure.retryState, 'not-retried')
    assert.strictEqual(failure.underlyingError, original)
    assert.ok(!failure.message.includes('/private/repository'))
  })

  it('records a failed validation retry', () => {
    const failure = createCopilotConflictResolutionError(
      new Error('Invalid response'),
      'validate-response',
      'failed-after-validation-retry'
    )

    assert.strictEqual(failure.stage, 'validate-response')
    assert.strictEqual(failure.retryState, 'failed-after-validation-retry')
  })

  it('preserves existing structured failures', () => {
    const failure = createCopilotConflictResolutionError(
      new Error('Client failed'),
      'create-client'
    )

    assert.strictEqual(
      createCopilotConflictResolutionError(failure, 'unknown'),
      failure
    )
  })
})
