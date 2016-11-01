import * as React from 'react'
import { Dispatcher } from '../../lib/dispatcher'
import { assertNever } from '../../lib/fatal-error'
import { Start } from './start'
import { SignIn } from './sign-in'
import { ConfigureGit } from './configure-git'

interface IWelcomeProps {
  readonly dispatcher: Dispatcher
}

enum WelcomeStep {
  Start,
  SignIn,
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
    const advance = () => this.advanceStep()
    const cancel = () => this.cancel()
    const props = { dispatcher: this.props.dispatcher, advance, cancel }

    switch (step) {
      case WelcomeStep.Start: return <Start {...props}/>
      case WelcomeStep.SignIn: return <SignIn {...props}/>
      case WelcomeStep.ConfigureGit: return <ConfigureGit {...props}/>
      default: return assertNever(step, `Unknown welcome step: ${step}`)
    }
  }

  private advanceStep() {
    const step = nextStep(this.state.currentStep)
    if (!step) {
      this.cancel()
      return
    }

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

function nextStep(step: WelcomeStep): WelcomeStep | null {
  switch (step) {
    case WelcomeStep.Start: return WelcomeStep.SignIn
    case WelcomeStep.SignIn: return WelcomeStep.ConfigureGit
    case WelcomeStep.ConfigureGit: return null
    default: return assertNever(step, `Unknown welcome step: ${step}`)
  }
}
