/** Progress at safe transaction boundaries, suitable for AppStore integration. */
export type AssistedCommitProgress =
  | { readonly kind: 'capturing' | 'validating' | 'rolling-back' }
  | {
      readonly kind: 'committing'
      readonly index: number
      readonly total: number
      readonly title: string
    }
  | {
      readonly kind: 'committed'
      readonly index: number
      readonly total: number
      readonly sha: string
    }

/** Capture/validation controls; cancellation never abandons in-flight Git. */
export interface IAssistedCommitOperationOptions {
  /** Cooperative cancellation checked before and after awaited operations. */
  readonly signal?: AbortSignal
  /** An awaited progress observer; observer failures interrupt the transaction. */
  readonly onProgress?: (
    progress: AssistedCommitProgress
  ) => void | Promise<void>
}
