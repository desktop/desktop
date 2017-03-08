import * as React from 'react'
import { AuthenticationForm } from './authentication-form'
import { assertNever } from '../../lib/fatal-error'
import { TwoFactorAuthentication } from '../lib/two-factor-authentication'
import { EnterpriseServerEntry } from '../lib/enterprise-server-entry'
import {
  Dispatcher,
  SignInState,
  SignInStep,
  IEndpointEntryState,
  IAuthenticationState,
  ITwoFactorAuthenticationState,
} from '../../lib/dispatcher'

interface ISignInProps {
  readonly signInState: SignInState
  readonly dispatcher: Dispatcher

  /** An array of additional buttons to render after the "Sign In" button. */
  readonly children?: ReadonlyArray<JSX.Element>
}

/** The sign in flow for GitHub. */
export class SignIn extends React.Component<ISignInProps, void> {

  private onEndpointEntered = (url: string) => {
    this.props.dispatcher.setSignInEndpoint(url)
  }

  private onCredentialsEntered = (username: string, password: string) => {
    this.props.dispatcher.setSignInCredentials(username, password)
  }

  private onBrowserSignInRequested = () => {
    this.props.dispatcher.requestBrowserAuthentication()
  }

  private onOTPEntered = (otp: string) => {
    this.props.dispatcher.setSignInOTP(otp)
  }

  private renderEndpointEntryStep(state: IEndpointEntryState) {
    return <EnterpriseServerEntry
      loading={state.loading}
      error={state.error}
      onSubmit={this.onEndpointEntered}
      additionalButtons={this.props.children}
    />
  }

  private renderAuthenticationStep(state: IAuthenticationState) {
    return (
      <AuthenticationForm
        loading={state.loading}
        error={state.error}
        supportsBasicAuth={state.supportsBasicAuth}
        additionalButtons={this.props.children}
        onBrowserSignInRequested={this.onBrowserSignInRequested}
        onSubmit={this.onCredentialsEntered}
        forgotPasswordUrl={state.forgotPasswordUrl}
      />
    )
  }

  private renderTwoFactorAuthenticationStep(state: ITwoFactorAuthenticationState) {
    return (
      <TwoFactorAuthentication
        loading={state.loading}
        error={state.error}
        type={state.type}
        onOTPEntered={this.onOTPEntered}
      />
    )
  }

  public render() {
    const state = this.props.signInState
    const stepText = this.props.signInState.kind

    switch (state.kind) {
      case SignInStep.EndpointEntry:
        return this.renderEndpointEntryStep(state)
      case SignInStep.Authentication:
        return this.renderAuthenticationStep(state)
      case SignInStep.TwoFactorAuthentication:
        return this.renderTwoFactorAuthenticationStep(state)
      case SignInStep.Success:
        return null
      default:
        return assertNever(state, `Unknown sign-in step: ${stepText}`)
    }
  }
}
