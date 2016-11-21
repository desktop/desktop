import * as React from 'react'
import { AuthenticationForm } from './authentication-form'
import { User } from '../../models/user'
import { assertNever } from '../../lib/fatal-error'
import { TwoFactorAuthentication } from '../lib/two-factor-authentication'

interface ISignInProps {
  /** The endpoint against which the user is authenticating. */
  readonly endpoint: string

  /** Does the server support basic auth? */
  readonly supportsBasicAuth: boolean

  /** Called after the user has signed in. */
  readonly onDidSignIn: (user: User) => void

  /** An array of additional buttons to render after the "Sign In" button. */
  readonly additionalButtons?: ReadonlyArray<JSX.Element>
}

enum SignInStep {
  UsernamePassword,
  TwoFactorAuthentication,
}

type Step = { kind: SignInStep.UsernamePassword } |
            { kind: SignInStep.TwoFactorAuthentication, login: string, password: string }

interface ISignInState {
  readonly step: Step
}

/** The sign in flow for GitHub. */
export class SignIn extends React.Component<ISignInProps, ISignInState> {
  public constructor(props: ISignInProps) {
    super(props)

    this.state = { step: { kind: SignInStep.UsernamePassword } }
  }

  public render() {
    const step = this.state.step
    if (step.kind === SignInStep.UsernamePassword) {
      return <AuthenticationForm
        endpoint={this.props.endpoint}
        supportsBasicAuth={this.props.supportsBasicAuth}
        additionalButtons={this.props.additionalButtons}
        onDidSignIn={this.onDidSignIn}
        onNeeds2FA={this.onNeeds2FA}/>
    } else if (step.kind === SignInStep.TwoFactorAuthentication) {
      return <TwoFactorAuthentication
        endpoint={this.props.endpoint}
        login={step.login}
        password={step.password}
        onDidSignIn={this.onDidSignIn}/>
    } else {
      return assertNever(step, `Unknown sign-in step: ${step}`)
    }
  }

  private onDidSignIn = (user: User) => {
    this.props.onDidSignIn(user)
  }

  private onNeeds2FA = (login: string, password: string) => {
    this.setState({
      step: { kind: SignInStep.TwoFactorAuthentication, login, password },
    })
  }
}
