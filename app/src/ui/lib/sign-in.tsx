import * as React from 'react'
import { AuthenticationForm } from './authentication-form'
import { assertNever } from '../../lib/fatal-error'
import { TwoFactorAuthentication } from '../lib/two-factor-authentication'
import { EnterpriseServerEntry } from '../lib/enterprise-server-entry'
import { Dispatcher, SignInStep, Step, AuthenticationMethods } from '../../lib/dispatcher'

interface ISignInProps {
  readonly currentStep: SignInStep
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
    const step = this.props.currentStep
    if (step.kind === Step.EndpointEntry) {
      return <EnterpriseServerEntry
        loading={step.loading}
        error={step.error}
        onSubmit={this.onEndpointEntered}
        additionalButtons={this.props.children}
      />
    } else if (step.kind === Step.Authentication) {
      const supportsBasicAuth = step.authMethods.has(AuthenticationMethods.BasicAuth)
      return <AuthenticationForm
        loading={step.loading}
        error={step.error}
        supportsBasicAuth={supportsBasicAuth}
        endpoint={step.endpoint}
        additionalButtons={this.props.children}
        onBrowserSignInRequested={this.onBrowserSignInRequested}
        onSubmit={this.onCredentialsEntered}/>
    } else if (step.kind === Step.TwoFactorAuthentication) {
      return <TwoFactorAuthentication
        loading={step.loading}
        error={step.error}
        onOTPEntered={this.onOTPEntered}/>
    } else if (step.kind === Step.Success) {
      return null
    } else {
      return assertNever(step, `Unknown sign-in step: ${step}`)
    }
  }
}
