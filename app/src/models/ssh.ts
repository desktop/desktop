export enum TroubleshootingStep {
  InitialState = 'InitialState',
  ValidateHost = 'ValidateHost',
  ChooseAccount = 'ChooseAccount',
  CreateSSHKey = 'CreateSSHKey',
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

export type ChooseAccount = {
  readonly kind: TroubleshootingStep.ChooseAccount
  readonly accounts: ReadonlyArray<Account>
}

export type CreateSSHKey = {
  readonly kind: TroubleshootingStep.CreateSSHKey
  readonly initialPath: string
}

export type UnknownResult = {
  readonly kind: TroubleshootingStep.Unknown
  readonly error: string
}

export type TroubleshootingState =
  | InitialState
  | ValidateHostAction
  | CreateSSHKey
  | UnknownResult
