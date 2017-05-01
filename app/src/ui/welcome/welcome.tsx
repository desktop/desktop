import * as React from 'react'
import { Dispatcher, AppStore, SignInState, SignInStep } from '../../lib/dispatcher'
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
  readonly signInState: SignInState | null
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
    this.advanceOnSuccessfulSignIn(nextProps)
  }

  /**
   * Returns a value indicating whether or not the welcome flow is
   * currently in one of the sign in steps, i.e. either dotcom sign
   * in or enterprise sign in.
   */
  private get inSignInStep() {
    if (this.state.currentStep === WelcomeStep.SignInToDotCom) {
      return true
    }

    if (this.state.currentStep === WelcomeStep.SignInToEnterprise) {
      return true
    }

    return false
  }

  /**
   * Checks to see whether or not we're currently in a sign in step
   * and whether the newly received props signal that the user has
   * signed in successfully. If both conditions holds true we move
   * the user to the configure git step.
   */
  private advanceOnSuccessfulSignIn(nextProps: IWelcomeProps) {
    // If we're not currently in a sign in flow we don't care about
    // new props
    if (!this.inSignInStep) {
      return
    }

    // We need to currently have a sign in state _and_ receive a new
    // one in order to be able to make any sort of determination about
    // what's going on in the sign in flow.
    if (!this.props.signInState || !nextProps.signInState) {
      return
    }

    // Only advance when the state first changes...
    if (this.props.signInState.kind !== nextProps.signInState.kind) {
      return
    }

    // ...and changes to success
    if (nextProps.signInState.kind === SignInStep.Success) {
      this.advanceToStep(WelcomeStep.ConfigureGit)
      this.props.dispatcher.resetSignInState()
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
      case WelcomeStep.ConfigureGit: return <ConfigureGit {...props} accounts={this.props.appStore.getState().accounts}/>
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
   const WelcomeImageUri = `file:///${__dirname}/static/illustration.svg`

    return (
      <UiView id='welcome'>
        <div className='welcome-left'>
          {this.getComponentForCurrentStep()}
        </div>

        <div className='welcome-right'>
         <img className='welcome-graphic' src={WelcomeImageUri} />
        </div>
      </UiView>
    )
  }
}
