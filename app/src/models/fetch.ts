/**
 * Enum used by fetch to determine if
 * a fetch was initiated by the backgroundFetcher
 */
export enum FetchType {
  BackgroundTask,
  UserInitiatedTask,
}

/** Progress for a user-initiated fetch of every local repository. */
export interface IFetchAllProgress {
  /** Repositories whose fetch has settled, including failures. */
  readonly completed: number
  /** Repositories selected for this fetch. */
  readonly total: number
}
