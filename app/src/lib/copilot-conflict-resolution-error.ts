import { isRecord } from './is-record'

export type CopilotConflictResolutionFailureStage =
  | 'gather-context'
  | 'resolve-model'
  | 'create-client'
  | 'create-session'
  | 'stream-response'
  | 'parse-response'
  | 'validate-response'
  | 'reassemble-response'
  | 'process-result'
  | 'unknown'

export type CopilotConflictResolutionRetryState =
  | 'not-retried'
  | 'failed-after-validation-retry'

const reportableErrorCodes = [
  'COPILOT_TURN_TIMEOUT',
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'COPILOT_EMPTY_RESPONSE',
  'rate_limited',
  'user_weekly_rate_limited',
  'user_global_rate_limited',
  'user_model_rate_limited',
  'integration_rate_limited',
  'quota_exceeded',
  'session_quota_exceeded',
  'billing_not_configured',
] as const

const reportableStatusCodes = [
  400, 401, 402, 403, 404, 408, 413, 429, 500, 502, 503, 504,
] as const

const reportableErrorTypes = [
  'authentication',
  'authorization',
  'policy',
  'quota',
  'rate_limit',
  'context_limit',
  'query',
] as const

/**
 * A conflict-resolution failure carrying only stable, privacy-safe metadata.
 *
 * The underlying error remains available for local logging and user-facing
 * error handling, while the error message contains only reportable metadata.
 */
export class CopilotConflictResolutionError extends Error {
  public readonly stage: CopilotConflictResolutionFailureStage
  public readonly retryState: CopilotConflictResolutionRetryState
  public readonly underlyingError: Error

  public constructor(
    error: unknown,
    stage: CopilotConflictResolutionFailureStage,
    retryState: CopilotConflictResolutionRetryState = 'not-retried'
  ) {
    const data = isRecord(error) ? error : {}
    const statusCode = reportableStatusCodes.find(
      status => status === data.statusCode
    )
    const errorCode = reportableErrorCodes.find(
      code => code === data.errorCode || code === data.code
    )
    const errorType = reportableErrorTypes.find(type => type === data.errorType)

    super(
      `Copilot Conflict Resolution Error: stage=${stage}, retryState=${retryState}, type=${
        errorType ?? 'unknown'
      }, status=${statusCode ?? 'unknown'}, code=${errorCode ?? 'unknown'}`
    )
    this.name = 'CopilotConflictResolutionError'
    this.stage = stage
    this.retryState = retryState
    this.underlyingError =
      error instanceof Error ? error : new Error('Unknown error')
  }
}
