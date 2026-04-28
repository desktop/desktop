import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  getCopilotErrorDisplayInfo,
  parseCopilotPaymentRequiredError,
} from '../../src/lib/copilot-error'

describe('parseCopilotPaymentRequiredError', () => {
  it('parses quota_exceeded responses', () => {
    const error = parseCopilotPaymentRequiredError(
      JSON.stringify({
        error: {
          code: 'quota_exceeded',
          message: 'You have used all available Copilot premium requests.',
        },
      }),
      '120'
    )

    assert.equal(
      error.message,
      'You have used all available Copilot premium requests.'
    )
    assert.equal(error.code, 'quota_exceeded')
    assert.equal(error.retryAfter, '120')
  })

  it('parses session_quota_exceeded responses', () => {
    const error = parseCopilotPaymentRequiredError(
      JSON.stringify({
        error: {
          code: 'session_quota_exceeded',
          message: 'You have reached the session limit for Copilot requests.',
        },
      }),
      null
    )

    assert.equal(
      error.message,
      'You have reached the session limit for Copilot requests.'
    )
    assert.equal(error.code, 'session_quota_exceeded')
    assert.equal(error.retryAfter, undefined)
  })

  it('parses billing_not_configured responses', () => {
    const error = parseCopilotPaymentRequiredError(
      JSON.stringify({
        error: {
          code: 'billing_not_configured',
          message: 'Configure billing in GitHub Settings to continue.',
        },
      }),
      null
    )

    assert.equal(
      error.message,
      'Configure billing in GitHub Settings to continue.'
    )
    assert.equal(error.code, 'billing_not_configured')
  })

  it('falls back to the raw response body when the server returns plain text', () => {
    const error = parseCopilotPaymentRequiredError(
      'You have reached your quota limit.',
      null
    )

    assert.equal(error.message, 'You have reached your quota limit.')
    assert.equal(error.code, undefined)
  })
})

describe('getCopilotErrorDisplayInfo', () => {
  it('returns a quota-specific title and retry timing for quota_exceeded', () => {
    const error = parseCopilotPaymentRequiredError(
      JSON.stringify({
        error: {
          code: 'quota_exceeded',
          message: 'You have used all available Copilot premium requests.',
        },
      }),
      '120'
    )

    const displayInfo = getCopilotErrorDisplayInfo(error)

    assert.notEqual(displayInfo, null)
    assert.equal(displayInfo?.title, 'Quota exceeded')
    assert.equal(
      displayInfo?.message,
      'You have used all available Copilot premium requests.'
    )
    assert.equal(
      displayInfo?.retryAfterMessage,
      'You can try again in 120 seconds.'
    )
    assert.equal(displayInfo?.actionText, undefined)
    assert.equal(displayInfo?.actionURL, undefined)
  })

  it('returns a distinct title for session_quota_exceeded', () => {
    const error = parseCopilotPaymentRequiredError(
      JSON.stringify({
        error: {
          code: 'session_quota_exceeded',
          message: 'You have reached the session limit for Copilot requests.',
        },
      }),
      null
    )

    const displayInfo = getCopilotErrorDisplayInfo(error)

    assert.notEqual(displayInfo, null)
    assert.equal(displayInfo?.title, 'Session quota exceeded')
    assert.equal(
      displayInfo?.message,
      'You have reached the session limit for Copilot requests.'
    )
    assert.equal(displayInfo?.actionText, undefined)
  })

  it('returns a settings CTA for billing_not_configured', () => {
    const error = parseCopilotPaymentRequiredError(
      JSON.stringify({
        error: {
          code: 'billing_not_configured',
          message: 'Configure billing in GitHub Settings to continue.',
        },
      }),
      null
    )

    const displayInfo = getCopilotErrorDisplayInfo(error)

    assert.notEqual(displayInfo, null)
    assert.equal(displayInfo?.title, 'Copilot billing not configured')
    assert.equal(
      displayInfo?.message,
      'Configure billing in GitHub Settings to continue.'
    )
    assert.equal(displayInfo?.actionText, 'Open GitHub Copilot settings')
    assert.equal(displayInfo?.actionURL, 'https://github.com/settings/copilot')
  })

  it('treats unknown 402 responses as a generic Copilot billing issue', () => {
    const error = parseCopilotPaymentRequiredError(
      'You have reached your quota limit.',
      null
    )

    const displayInfo = getCopilotErrorDisplayInfo(error)

    assert.notEqual(displayInfo, null)
    assert.equal(displayInfo?.title, 'Copilot billing issue')
    assert.equal(displayInfo?.message, 'You have reached your quota limit.')
    assert.equal(displayInfo?.actionText, undefined)
  })
})
