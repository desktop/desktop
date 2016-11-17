import * as React from 'react'
import { WelcomeStep } from './welcome'
import { Button } from '../lib/button'
import { SignIn } from '../lib/sign-in'
import { TwoFactorAuthentication } from '../lib/two-factor-authentication'
import { User } from '../../models/user'
import { Dispatcher } from '../../lib/dispatcher'
import { assertNever } from '../../lib/fatal-error'

interface ISignInEnterpriseProps {
  readonly dispatcher: Dispatcher
  readonly advance: (step: WelcomeStep) => void
}

enum SignInStep {
  ServerEntry,
  UsernamePassword,
  TwoFactorAuthentication,
}

type Step = { kind: SignInStep.ServerEntry } |
            { kind: SignInStep.UsernamePassword, endpoint: string } |
            { kind: SignInStep.TwoFactorAuthentication, endpoint: string, login: string, password: string }

interface ISignInEnterpriseState {
  readonly step: Step
}

/** The Welcome flow step to login to an Enterprise instance. */
export class SignInEnterprise extends React.Component<ISignInEnterpriseProps, ISignInEnterpriseState> {
  public constructor(props: ISignInEnterpriseProps) {
    super(props)

    this.state = { step: { kind: SignInStep.ServerEntry } }
  }

  public render() {
    return (
      <div id='sign-in-enterprise'>
        <h1>Sign in to your GitHub Enterprise server</h1>
        <div>Get started by signing into GitHub Enterprise</div>

        {this.renderStep()}
      </div>
    )
  }

  private renderStep() {
    const step = this.state.step
    if (step.kind === SignInStep.ServerEntry) {
      return null
    } else if (step.kind === SignInStep.UsernamePassword) {
      return <SignIn
        endpoint={step.endpoint}
        additionalButtons={[
          <Button key='cancel' onClick={this.cancel}>Cancel</Button>,
        ]}
        onDidSignIn={this.onDidSignIn}
        onNeeds2FA={this.onNeeds2FA}/>
    } else if (step.kind === SignInStep.TwoFactorAuthentication) {
      return <TwoFactorAuthentication
        endpoint={step.endpoint}
        login={step.login}
        password={step.password}
        onDidSignIn={this.onDidSignIn}/>
    } else {
      return assertNever(step, `Unknown sign-in step: ${step}`)
    }
  }

  private cancel = () => {
    this.props.advance(WelcomeStep.Start)
  }

  private onDidSignIn = async (user: User) => {
    await this.props.dispatcher.addUser(user)

    this.props.advance(WelcomeStep.ConfigureGit)
  }

  private onNeeds2FA = (login: string, password: string) => {
    this.setState({
      step: { kind: SignInStep.TwoFactorAuthentication, login, password },
    })
  }
}
