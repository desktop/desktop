import { Account } from './account'

export enum TroubleshootingStep {
  InitialState = 'InitialState',
  ValidateHost = 'ValidateHost',
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

export type CreateSSHKey = {
  readonly kind: TroubleshootingStep.CreateSSHKey
  readonly accounts: ReadonlyArray<Account>
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
