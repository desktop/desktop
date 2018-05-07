export enum TroubleshootingStep {
  InitialState = 'InitialState',
  ValidateHost = 'ValidateHost',
  NoAccount = 'NoAccount',
  Unknown = 'Unknown',
}

export type InitialState = {
  readonly kind: TroubleshootingStep.InitialState
  readonly isLoading: boolean
}

export type ValidateHostAction = {
  readonly kind: TroubleshootingStep.ValidateHost
  readonly host: string
  readonly rawOutput: string
  readonly isLoading: boolean
}

export type NoAccountAction = {
  readonly kind: TroubleshootingStep.NoAccount
  readonly foundAccounts: ReadonlyArray<{ file: string; emailAddress: string }>
}

export type UnknownResult = {
  readonly kind: TroubleshootingStep.Unknown
  readonly error: string
}

export type TroubleshootingState =
  | InitialState
  | ValidateHostAction
  | NoAccountAction
  | UnknownResult
