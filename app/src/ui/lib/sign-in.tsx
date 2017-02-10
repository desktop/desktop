import * as React from 'react'
import { AuthenticationForm } from './authentication-form'
import { User } from '../../models/user'
import { assertNever, fatalError } from '../../lib/fatal-error'
import { TwoFactorAuthentication } from '../lib/two-factor-authentication'
import { EnterpriseServerEntry, AuthenticationMethods } from '../lib/enterprise-server-entry'
import { SignInStep, Step } from '../../lib/dispatcher/sign-in-store'

interface ISignInProps {
  readonly currentStep: SignInStep

  /** An array of additional buttons to render after the "Sign In" button. */
  readonly children?: ReadonlyArray<JSX.Element>
}

/** The sign in flow for GitHub. */
export class SignIn extends React.Component<ISignInProps, void> {

  public render() {
    const step = this.props.currentStep
    if (step.kind === Step.EndpointEntry) {
      return <EnterpriseServerEntry
        onContinue={this.onContinue}
        additionalButtons={this.props.children}
      />
    } else if (step.kind === Step.Authentication) {
      const supportsBasicAuth = step.authMethods.has(AuthenticationMethods.BasicAuth)
      return <AuthenticationForm
        endpoint={step.endpoint}
        supportsBasicAuth={supportsBasicAuth}
        additionalButtons={this.props.children}
        onDidSignIn={this.onDidSignIn}
        onNeeds2FA={this.onNeeds2FA}/>
    } else if (step.kind === Step.TwoFactorAuthentication) {
      return <TwoFactorAuthentication
        endpoint={step.endpoint}
        login={step.username}
        password={step.password}
        onDidSignIn={this.onDidSignIn}/>
    } else {
      return assertNever(step, `Unknown sign-in step: ${step}`)
    }
  }

  private onContinue = (endpoint: string, authMethods: Set<AuthenticationMethods>) => {
    this.setState({
      step: {
        kind: SignInStep.Authentication,
        endpoint,
        authMethods,
      },
    })
  }

  private onDidSignIn = (user: User) => {
    this.props.onDidSignIn(user)
  }

  private onNeeds2FA = (login: string, password: string) => {
    const currentStep = this.state.step
    if (currentStep.kind !== SignInStep.Authentication) {
      fatalError('You should only enter 2FA after authenticating!')
      return
    }

    this.setState({
      step: {
        kind: SignInStep.TwoFactorAuthentication,
        endpoint: currentStep.endpoint,
        login,
        password,
      },
    })
  }
}
