import * as React from 'react'
import { AuthenticationForm } from './authentication-form'
import { assertNever } from '../../lib/fatal-error'
import { TwoFactorAuthentication } from '../lib/two-factor-authentication'
import { EnterpriseServerEntry } from '../lib/enterprise-server-entry'
import { Dispatcher } from '../dispatcher'
import {
  SignInState,
  SignInStep,
  IEndpointEntryState,
  IAuthenticationState,
  ITwoFactorAuthenticationState,
} from '../../lib/stores'

interface ISignInProps {
  readonly signInState: SignInState
  readonly dispatcher: Dispatcher
}

/**
 * The sign in flow for GitHub.
 *
 * Provide `children` elements to render additional buttons in the active form.
 */
export class SignIn extends React.Component<ISignInProps, {}> {
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
    const children = this.props.children as ReadonlyArray<JSX.Element>
    return (
      <EnterpriseServerEntry
        loading={state.loading}
        error={state.error}
        onSubmit={this.onEndpointEntered}
        additionalButtons={children}
      />
    )
  }

  private renderAuthenticationStep(state: IAuthenticationState) {
    const children = this.props.children as ReadonlyArray<JSX.Element>

    return (
      <AuthenticationForm
        loading={state.loading}
        error={state.error}
        supportsBasicAuth={state.supportsBasicAuth}
        additionalButtons={children}
        onBrowserSignInRequested={this.onBrowserSignInRequested}
        onSubmit={this.onCredentialsEntered}
        forgotPasswordUrl={state.forgotPasswordUrl}
        endpoint={state.endpoint}
      />
    )
  }

  private renderTwoFactorAuthenticationStep(
    state: ITwoFactorAuthenticationState
  ) {
    return (
      <TwoFactorAuthentication
        loading={state.loading}
        error={state.error}
        type={state.type}
        additionalButtons={this.props.children}
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
