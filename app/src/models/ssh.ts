export enum TroubleshootingStep {
  InitialState = 'InitialState',
  SuggestAction = 'SuggestAction',
  ValidateHost = 'ValidateHost',
  Unknown = 'Unknown',
}

export type InitialState = {
  readonly kind: TroubleshootingStep.InitialState
  readonly isLoading: boolean
}

export type ValidateHostAction = {
  readonly kind: TroubleshootingStep.ValidateHost
  readonly rawOutput: string
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
  | ValidateHostAction
  | UnknownResult
  | SuggestedAction
