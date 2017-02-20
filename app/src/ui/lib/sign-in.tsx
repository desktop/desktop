import * as React from 'react'
import { AuthenticationForm } from './authentication-form'
import { User } from '../../models/user'
import { assertNever, fatalError } from '../../lib/fatal-error'
import { Dispatcher } from '../../lib/dispatcher'
import { TwoFactorAuthentication } from '../lib/two-factor-authentication'
import { EnterpriseServerEntry, AuthenticationMethods } from '../lib/enterprise-server-entry'

interface ISignInProps {
  readonly dispatcher: Dispatcher

  /**
   * The endpoint against which the user is authenticating. If omitted, the
   * component will prompt for endpoint entry before moving on to the sign in
   * flow.
   */
  readonly endpoint?: string

  /**
   * The set of authentication methods supported by the endpoint. This is only
   * used if `endpoint` is defined in the props.
   */
  readonly authenticationMethods?: Set<AuthenticationMethods>

  /** Called after the user has signed in. */
  readonly onDidSignIn: (user: User) => void

  /** An array of additional buttons to render after the "Sign In" button. */
  readonly children?: ReadonlyArray<JSX.Element>
}

enum SignInStep {
  EndpointEntry,
  Authentication,
  TwoFactorAuthentication,
}

/** The default set of authentication methods. */
export const DefaultAuthMethods = new Set([
  AuthenticationMethods.BasicAuth,
  AuthenticationMethods.OAuth,
])

type Step = { kind: SignInStep.EndpointEntry } |
            { kind: SignInStep.Authentication, endpoint: string, authMethods: Set<AuthenticationMethods> } |
            { kind: SignInStep.TwoFactorAuthentication, endpoint: string, login: string, password: string }

interface ISignInState {
  readonly step: Step
}

/** The sign in flow for GitHub. */
export class SignIn extends React.Component<ISignInProps, ISignInState> {
  public constructor(props: ISignInProps) {
    super(props)

    this.state = { step: this.stepForProps(props) }
  }

  public componentWillReceiveProps(nextProps: ISignInProps) {
    if (nextProps.endpoint !== this.props.endpoint) {
      this.setState({ step: this.stepForProps(nextProps) })
    }
  }

  private stepForProps(props: ISignInProps): Step {
    if (props.endpoint) {
      return {
        kind: SignInStep.Authentication,
        endpoint: props.endpoint,
        authMethods: props.authenticationMethods || DefaultAuthMethods,
      }
    } else {
      return {
        kind: SignInStep.EndpointEntry,
      }
    }
  }

  public render() {
    const step = this.state.step
    if (step.kind === SignInStep.EndpointEntry) {
      return <EnterpriseServerEntry
        onContinue={this.onContinue}
        additionalButtons={this.props.children}
      />
    } else if (step.kind === SignInStep.Authentication) {
      const supportsBasicAuth = step.authMethods.has(AuthenticationMethods.BasicAuth)
      return <AuthenticationForm
        dispatcher={this.props.dispatcher}
        endpoint={step.endpoint}
        supportsBasicAuth={supportsBasicAuth}
        additionalButtons={this.props.children}
        onDidSignIn={this.onDidSignIn}
        onNeeds2FA={this.onNeeds2FA}/>
    } else if (step.kind === SignInStep.TwoFactorAuthentication) {
      return <TwoFactorAuthentication
        dispatcher={this.props.dispatcher}
        endpoint={step.endpoint}
        login={step.login}
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
