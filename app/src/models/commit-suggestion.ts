/**
 * Represents a single AI-suggested commit from the smart split feature.
 * Each suggestion groups semantically related files with an AI-generated
 * commit message.
 */
export interface ICommitSuggestion {
  /** Commit title following the user's format template */
  readonly summary: string
  /** Optional commit body/description */
  readonly description: string
  /** File paths belonging to this commit group */
  readonly files: ReadonlyArray<string>
  /** Whether this suggestion is included for committing */
  readonly enabled: boolean
}

/** The response shape returned by the AI for smart commit splitting */
export interface ISmartCommitSplitResponse {
  readonly suggestions: ReadonlyArray<{
    readonly summary: string
    readonly description: string
    readonly files: ReadonlyArray<string>
  }>
}
