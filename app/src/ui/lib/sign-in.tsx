import * as React from 'react'
import { AuthenticationForm } from './authentication-form'
import { assertNever } from '../../lib/fatal-error'
import { TwoFactorAuthentication } from '../lib/two-factor-authentication'
import { EnterpriseServerEntry } from '../lib/enterprise-server-entry'
import { Dispatcher, SignInState, SignInStep, AuthenticationMethods } from '../../lib/dispatcher'

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

  public render() {
    const state = this.props.signInState
    const stepText = this.props.signInState.kind

    if (state.kind === SignInStep.EndpointEntry) {
      return <EnterpriseServerEntry
        loading={state.loading}
        error={state.error}
        onSubmit={this.onEndpointEntered}
        additionalButtons={this.props.children}
      />
    } else if (state.kind === SignInStep.Authentication) {
      const supportsBasicAuth = state.authMethods.has(AuthenticationMethods.BasicAuth)
      return <AuthenticationForm
        loading={state.loading}
        error={state.error}
        supportsBasicAuth={supportsBasicAuth}
        endpoint={state.endpoint}
        additionalButtons={this.props.children}
        onBrowserSignInRequested={this.onBrowserSignInRequested}
        onSubmit={this.onCredentialsEntered}/>
    } else if (state.kind === SignInStep.TwoFactorAuthentication) {
      return <TwoFactorAuthentication
        loading={state.loading}
        error={state.error}
        onOTPEntered={this.onOTPEntered}/>
    } else if (state.kind === SignInStep.Success) {
      return null
    } else {
      return assertNever(state, `Unknown sign-in step: ${stepText}`)
    }
  }
}
