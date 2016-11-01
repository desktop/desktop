import * as React from 'react'
import { Dispatcher } from '../../lib/dispatcher'
import { assertNever } from '../../lib/fatal-error'
import { Start } from './start'
import { SignInDotCom } from './sign-in-dot-com'
import { SignInEnterprise } from './sign-in-enterprise'
import { ConfigureGit } from './configure-git'

interface IWelcomeProps {
  readonly dispatcher: Dispatcher
}

export enum WelcomeStep {
  Start,
  SignInToDotCom,
  SignInToEnterprise,
  ConfigureGit,
}

interface IWelcomeState {
  readonly currentStep: WelcomeStep
}

export class Welcome extends React.Component<IWelcomeProps, IWelcomeState> {
  public constructor(props: IWelcomeProps) {
    super(props)

    this.state = { currentStep: WelcomeStep.Start }
  }

  private componentForCurrentStep() {
    const step = this.state.currentStep
    const advance = (step: WelcomeStep) => this.advanceToStep(step)
    const cancel = () => this.cancel()
    const props = { dispatcher: this.props.dispatcher, advance, cancel }

    switch (step) {
      case WelcomeStep.Start: return <Start {...props}/>
      case WelcomeStep.SignInToDotCom: return <SignInDotCom {...props}/>
      case WelcomeStep.SignInToEnterprise: return <SignInEnterprise {...props}/>
      case WelcomeStep.ConfigureGit: return <ConfigureGit {...props}/>
      default: return assertNever(step, `Unknown welcome step: ${step}`)
    }
  }

  private advanceToStep(step: WelcomeStep) {
    this.setState({ currentStep: step })
  }

  private cancel() {
    // TODO: probably tell the dispatcher
  }

  public render() {
    return (
      <div>
        {this.componentForCurrentStep()}
      </div>
    )
  }
}
