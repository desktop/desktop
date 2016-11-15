import * as React from 'react'
import { WelcomeStep } from './welcome'
import { SignInDotCom as SignInDotComFragment } from '../lib/sign-in-dot-com'
import { Dispatcher } from '../../lib/dispatcher'
import { Button } from '../lib/button'
import { User } from '../../models/user'
import { assertNever } from '../../lib/fatal-error'
import { TwoFactorAuthentication } from '../lib/two-factor-authentication'
import { getDotComAPIEndpoint } from '../../lib/api'

interface ISignInDotComProps {
  readonly dispatcher: Dispatcher
  readonly advance: (step: WelcomeStep) => void
}

enum SignInStep {
  UsernamePassword,
  TwoFactorAuthentication,
}

interface ISignInDotComState {
  readonly step: { kind: SignInStep.UsernamePassword } | { kind: SignInStep.TwoFactorAuthentication, login: string, password: string }
}

/** The Welcome flow step to login to GitHub.com. */
export class SignInDotCom extends React.Component<ISignInDotComProps, ISignInDotComState> {
  public constructor(props: ISignInDotComProps) {
    super(props)

    this.state = { step: { kind: SignInStep.UsernamePassword } }
  }

  public render() {
    return (
      <div id='sign-in-dot-com'>
        <h1>Sign in to GitHub.com</h1>
        <div>Get started by signing into GitHub.com</div>

        {this.renderStep()}
      </div>
    )
  }

  private renderStep() {
    const step = this.state.step
    if (step.kind === SignInStep.UsernamePassword) {
      return <SignInDotComFragment
        additionalButtons={[
          <Button key='cancel' onClick={() => this.cancel()}>Cancel</Button>,
        ]}
        onSignInWithBrowser={() => this.signInWithBrowser()}
        onDidSignIn={u => this.onDidSignIn(u)}
        onNeeds2FA={(login, password) => this.onNeeds2FA(login, password)}/>
    } else if (step.kind === SignInStep.TwoFactorAuthentication) {
      return <TwoFactorAuthentication
        endpoint={getDotComAPIEndpoint()}
        login={step.login}
        password={step.password}
        onDidSignIn={u => this.onDidSignIn(u)}/>
    } else {
      return assertNever(step, `Unknown sign-in step: ${step}`)
    }
  }

  private async signInWithBrowser() {
    await this.props.dispatcher.requestOAuth(getDotComAPIEndpoint())

    this.props.advance(WelcomeStep.ConfigureGit)
  }

  private cancel() {
    this.props.advance(WelcomeStep.Start)
  }

  private async onDidSignIn(user: User) {
    await this.props.dispatcher.addUser(user)

    this.props.advance(WelcomeStep.ConfigureGit)
  }

  private onNeeds2FA(login: string, password: string) {
    this.setState({
      step: { kind: SignInStep.TwoFactorAuthentication, login, password },
    })
  }
}
