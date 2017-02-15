import * as React from 'react'
import { Dispatcher, AppStore, SignInStep, Step } from '../../lib/dispatcher'
import { assertNever } from '../../lib/fatal-error'
import { Start } from './start'
import { SignInDotCom } from './sign-in-dot-com'
import { SignInEnterprise } from './sign-in-enterprise'
import { ConfigureGit } from './configure-git'
import { UiView } from '../ui-view'
import { UsageOptOut } from './usage-opt-out'

/** The steps along the Welcome flow. */
export enum WelcomeStep {
  Start,
  SignInToDotCom,
  SignInToEnterprise,
  ConfigureGit,
  UsageOptOut,
}

interface IWelcomeProps {
  readonly dispatcher: Dispatcher
  readonly appStore: AppStore
  readonly signInState: SignInStep | null
}

interface IWelcomeState {
  readonly currentStep: WelcomeStep
}

/** The Welcome flow. */
export class Welcome extends React.Component<IWelcomeProps, IWelcomeState> {
  public constructor(props: IWelcomeProps) {
    super(props)

    this.state = { currentStep: WelcomeStep.Start }
  }

  public componentWillReceiveProps(nextProps: IWelcomeProps) {
    // If we're currently in a sign in flow and the Sign in state changes
    // to signal that we've successfully logged in we'll advance to the
    // next step
    if (this.state.currentStep === WelcomeStep.SignInToDotCom || this.state.currentStep === WelcomeStep.SignInToEnterprise) {
      if (this.props.signInState && nextProps.signInState && nextProps.signInState.kind === Step.Success) {
        this.advanceToStep(WelcomeStep.ConfigureGit)
        this.props.dispatcher.resetSignInState()
      }
    }
  }

  private getComponentForCurrentStep() {
    const step = this.state.currentStep
    const advance = (step: WelcomeStep) => this.advanceToStep(step)
    const done = () => this.done()
    const signInState = this.props.signInState
    const props = { dispatcher: this.props.dispatcher, advance, done }

    switch (step) {
      case WelcomeStep.Start: return <Start {...props}/>
      case WelcomeStep.SignInToDotCom: return <SignInDotCom {...props} signInState={signInState} />
      case WelcomeStep.SignInToEnterprise: return <SignInEnterprise {...props} signInState={signInState} />
      case WelcomeStep.ConfigureGit: return <ConfigureGit {...props} users={this.props.appStore.getState().users}/>
      case WelcomeStep.UsageOptOut: return <UsageOptOut {...props} optOut={this.props.appStore.getStatsOptOut()}/>
      default: return assertNever(step, `Unknown welcome step: ${step}`)
    }
  }

  private advanceToStep(step: WelcomeStep) {

    if (step === WelcomeStep.SignInToDotCom) {
      this.props.dispatcher.beginDotComSignIn()
    } else if (step === WelcomeStep.SignInToEnterprise) {
      this.props.dispatcher.beginEnterpriseSignIn()
    }

    this.setState({ currentStep: step })
  }

  private done() {
    this.props.dispatcher.endWelcomeFlow()
  }

  public render() {
    return (
      <UiView id='welcome'>
        {this.getComponentForCurrentStep()}
      </UiView>
    )
  }
}
