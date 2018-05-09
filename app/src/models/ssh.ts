import { Account } from './account'

export enum TroubleshootingStep {
  WelcomeState = 'WelcomeState',
  ValidateHost = 'ValidateHost',
  NoRunningAgent = 'NoRunningAgent',
  CreateSSHKey = 'CreateSSHKey',
  Unknown = 'Unknown',
}

export interface IWelcomeState {
  readonly kind: TroubleshootingStep.WelcomeState
  readonly sshUrl: string
  readonly isLoading?: boolean
}

export interface IValidateHostState {
  readonly kind: TroubleshootingStep.ValidateHost
  readonly host: string
  readonly rawOutput: string
  readonly sshUrl: string
  readonly isLoading?: boolean
}

export interface INoRunningAgentState {
  readonly kind: TroubleshootingStep.NoRunningAgent
  readonly sshLocation: string
  readonly sshUrl: string
  readonly isLoading?: boolean
}

export interface ICreateSSHKeyState {
  readonly kind: TroubleshootingStep.CreateSSHKey
  readonly accounts: ReadonlyArray<Account>
  readonly sshUrl: string
  readonly isLoading?: boolean
}

export interface IUnknownResultState {
  readonly kind: TroubleshootingStep.Unknown
  readonly error: string
}

export type TroubleshootingState =
  | IWelcomeState
  | IValidateHostState
  | INoRunningAgentState
  | ICreateSSHKeyState
  | IUnknownResultState
