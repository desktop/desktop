import { ErrorWithMetadata } from '../lib/error-with-metadata'
import {
  IAssistedCommitRecovery,
  IAssistedCommitResult,
} from '../lib/git/assisted-commit'

/** Repository-owned UI state. Capabilities and cancellation controllers belong to AppStore. */
export type AssistedCommitRunState =
  | { readonly kind: 'idle' }
  | {
      readonly kind:
        | 'awaiting-consent'
        | 'preparing'
        | 'capturing'
        | 'analyzing'
        | 'summarizing-selection'
        | 'validating'
        | 'finishing'
      readonly runId: string
      readonly cancelRequested: boolean
    }
  | {
      readonly kind: 'committing'
      readonly runId: string
      readonly index: number
      readonly total: number
      readonly title: string
      readonly cancelRequested: boolean
    }
  | { readonly kind: 'rolling-back'; readonly runId: string }
  | { readonly kind: 'refreshing'; readonly runId: string }
  | { readonly kind: 'closing'; readonly runId: string }
  | {
      readonly kind: 'error'
      readonly runId: string
      readonly error: ErrorWithMetadata
      readonly recovery?: IAssistedCommitRecovery
      readonly retry: 'recovery' | 'refresh' | null
      readonly selectionNeedsReview: boolean
      /** Error actions stay locked through original settlement and associated readers. */
      readonly settling: boolean
    }

/** Only the executor result authorizes local success, never progress or callback dispatch. */
export type AssistedCommitRunOutcome =
  | { readonly kind: 'local-ready'; readonly result: IAssistedCommitResult }
  | { readonly kind: 'cancelled' | 'declined' | 'busy' }
  | { readonly kind: 'error'; readonly error: ErrorWithMetadata }

/** Whether the run is executing, rather than ready or displaying a settled error. */
export function isAssistedCommitRunBusy(
  state: AssistedCommitRunState
): boolean {
  return state.kind !== 'idle' && (state.kind !== 'error' || state.settling)
}

/** Repository mutations remain locked when an error retains unresolved recovery ownership. */
export function isAssistedCommitRepositoryLocked(
  state: AssistedCommitRunState
): boolean {
  return (
    isAssistedCommitRunBusy(state) ||
    (state.kind === 'error' && state.retry !== null)
  )
}
