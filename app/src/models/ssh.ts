export enum TroubleshootingStep {
  InitialState = 'InitialState',
  SuggestAction = 'SuggestAction',
  Unknown = 'Unknown',
}

export type InitialState = {
  readonly kind: TroubleshootingStep.InitialState
  readonly isLoading: boolean
}

export type SuggestedAction = {
  readonly kind: TroubleshootingStep.SuggestAction
}

export type UnknownResult = {
  readonly kind: TroubleshootingStep.Unknown
  readonly output: string
  readonly error: string
}

export type TroubleshootingState =
  | InitialState
  | UnknownResult
  | SuggestedAction
