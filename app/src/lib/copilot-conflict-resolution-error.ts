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

function getFailureReason(
  statusCode: number | undefined,
  errorCode: string | undefined,
  errorType: unknown
) {
  if (errorCode === 'ETIMEDOUT' || statusCode === 408 || statusCode === 504) {
    return 'timeout'
  }
  if (errorCode === 'COPILOT_EMPTY_RESPONSE') {
    return 'empty-response'
  }
  if (statusCode === 401 || errorType === 'authentication') {
    return 'authentication'
  }
  if (statusCode === 403 || errorType === 'authorization') {
    return 'authorization'
  }
  if (
    statusCode === 429 ||
    errorType === 'rate_limit' ||
    errorCode === 'rate_limited' ||
    errorCode === 'user_weekly_rate_limited' ||
    errorCode === 'user_global_rate_limited' ||
    errorCode === 'user_model_rate_limited' ||
    errorCode === 'integration_rate_limited'
  ) {
    return 'rate-limit'
  }
  if (
    statusCode === 402 ||
    errorType === 'quota' ||
    errorCode === 'quota_exceeded' ||
    errorCode === 'session_quota_exceeded' ||
    errorCode === 'billing_not_configured'
  ) {
    return 'quota'
  }
  if (
    errorCode === 'ECONNRESET' ||
    errorCode === 'ECONNREFUSED' ||
    errorCode === 'ENOTFOUND' ||
    errorCode === 'EAI_AGAIN' ||
    errorCode === 'EPIPE'
  ) {
    return 'connection'
  }
  if (statusCode !== undefined && statusCode >= 500) {
    return 'service'
  }
  return 'unknown'
}

function getElapsedBucket(elapsedMs: number | undefined) {
  if (elapsedMs === undefined || !Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return 'unknown'
  }
  if (elapsedMs < 5_000) {
    return 'under-5s'
  }
  if (elapsedMs < 30_000) {
    return '5s-to-30s'
  }
  if (elapsedMs < 120_000) {
    return '30s-to-120s'
  }
  if (elapsedMs < 600_000) {
    return '120s-to-600s'
  }
  return '600s-or-more'
}

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
  private readonly reason: ReturnType<typeof getFailureReason>
  private readonly statusCode: number | undefined
  private readonly errorCode: string | undefined

  public constructor(
    error: unknown,
    stage: CopilotConflictResolutionFailureStage,
    retryState: CopilotConflictResolutionRetryState = 'not-retried',
    elapsedMs?: number
  ) {
    const data = isRecord(error) ? error : {}
    const statusCode =
      error instanceof CopilotConflictResolutionError
        ? error.statusCode
        : reportableStatusCodes.find(status => status === data.statusCode)
    const errorCode =
      error instanceof CopilotConflictResolutionError
        ? error.errorCode
        : reportableErrorCodes.find(
            code => code === data.errorCode || code === data.code
          )
    const reason =
      error instanceof CopilotConflictResolutionError
        ? error.reason
        : getFailureReason(statusCode, errorCode, data.errorType)
    const elapsed = getElapsedBucket(elapsedMs)

    super(
      `Copilot Conflict Resolution Error: stage=${stage}, retryState=${retryState}, reason=${reason}, status=${
        statusCode ?? 'unknown'
      }, code=${errorCode ?? 'unknown'}, elapsed=${elapsed}`
    )
    this.name = 'CopilotConflictResolutionError'
    this.reason = reason
    this.statusCode = statusCode
    this.errorCode = errorCode
    this.stage = stage
    this.retryState = retryState
    this.underlyingError =
      error instanceof CopilotConflictResolutionError
        ? error.underlyingError
        : error instanceof Error
        ? error
        : new Error('Unknown error')
  }
}
