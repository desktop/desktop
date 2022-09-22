/** A commit message summary and description. */
export interface ICommitMessage {
  readonly summary: string
  readonly description: string | null
}

export const DefaultCommitMessage: ICommitMessage = {
  summary: '',
  description: '',
}
