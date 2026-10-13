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
    super(
      `Copilot Conflict Resolution Error: stage=${stage}, retryState=${retryState}`
    )
    this.name = 'CopilotConflictResolutionError'
    this.stage = stage
    this.retryState = retryState
    this.underlyingError =
      error instanceof Error ? error : new Error('Unknown error')
  }
}
