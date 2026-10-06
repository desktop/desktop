import {
  IAssistedCommitHead,
  IAssistedCommitSnapshot,
} from '../../../models/assisted-commit'

/** Observable assisted-commit failures, never success-shaped fallbacks. */
export type AssistedCommitErrorCode =
  | 'cancelled'
  | 'selection-changed'
  | 'repository-changed'
  | 'index-changed'
  | 'invalid-plan'
  | 'unsafe-selection'
  | 'unsafe-plan'
  | 'commit-failed'
  | 'hook-aborted'
  | 'recovery-failed'
  | 'cleanup-failed'
  | 'disposed'
  | 'busy'

/** Exact recovery information for an interrupted Desktop-owned transaction. */
export interface IAssistedCommitRecovery {
  /** The original snapshot, including caller-owned selection restoration data. */
  readonly snapshot: IAssistedCommitSnapshot
  /** All verified commit objects created by this run, using full object IDs. */
  readonly createdCommits: ReadonlyArray<string>
  /** The last tip the run attempted to publish; rollback requires this exact tip. */
  readonly expectedTip: string | null
  /** HEAD observed after recovery, or null if it could not be read. */
  readonly observedHead: IAssistedCommitHead | null
  /** Whether the original history was restored without touching external commits. */
  readonly history: 'unchanged' | 'restored' | 'interfered'
  /** Whether the original real index was kept/restored, or left to an external writer. */
  readonly index: 'unchanged' | 'restored' | 'interfered'
  /** Recovery errors requiring manual attention. */
  readonly errors: ReadonlyArray<unknown>
  /** Opaque retained backup/ownership state when automatic recovery needs retry. */
  readonly retryToken?: IAssistedCommitRecoveryToken
}

/** A Desktop-owned backup and any unresolved resource-cleanup obligations. */
export interface IAssistedCommitRecoveryToken {
  /** Identity of the snapshot whose in-memory backup is retained. */
  readonly snapshotId: string
}

/** A typed failure with its original cause and, when executing, recovery state. */
export class AssistedCommitError extends Error {
  /** The stable failure classification for integration callers. */
  public readonly code: AssistedCommitErrorCode
  /** The outcome of recovery, present for executor failures. */
  public readonly recovery: IAssistedCommitRecovery | undefined

  public constructor(
    code: AssistedCommitErrorCode,
    message: string,
    options?: {
      readonly cause?: unknown
      readonly recovery?: IAssistedCommitRecovery
    }
  ) {
    super(message, { cause: options?.cause })
    this.name = 'AssistedCommitError'
    this.code = code
    this.recovery = options?.recovery
  }
}

/** Stop at a safe boundary, without abandoning an in-flight Git operation. */
export function checkAssistedCommitCancellation(signal?: AbortSignal): void {
  if (signal?.aborted === true) {
    throw new AssistedCommitError('cancelled', 'Assisted commit cancelled')
  }
}
