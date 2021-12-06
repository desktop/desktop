import * as React from 'react'
import classNames from 'classnames'

import { Dispatcher } from '../dispatcher'
import { encodePathAsUrl } from '../../lib/path'
import { Account } from '../../models/account'
import { SignInState, SignInStep } from '../../lib/stores'
import { assertNever } from '../../lib/fatal-error'
import { Start } from './start'
import { SignInEnterprise } from './sign-in-enterprise'
import { ConfigureGit } from './configure-git'
import { UiView } from '../ui-view'

/** The steps along the Welcome flow. */
export enum WelcomeStep {
  Start = 'Start',
  SignInToDotComWithBrowser = 'SignInToDotComWithBrowser',
  SignInToEnterprise = 'SignInToEnterprise',
  ConfigureGit = 'ConfigureGit',
}

interface IWelcomeProps {
  readonly dispatcher: Dispatcher
  readonly optOut: boolean
  readonly accounts: ReadonlyArray<Account>
  readonly signInState: SignInState | null
}

interface IWelcomeState {
  readonly currentStep: WelcomeStep

  /**
   * Whether the welcome wizard is terminating. Used
   * in order to delay the actual dismissal of the view
   * such that the exit animations (defined in css) have
   * time to run to completion.
   */
  readonly exiting: boolean
}

// Note that we're reusing the welcome illustrations in the crash process, any
// changes to these will have to be reflected in the crash process as well.
const WelcomeRightImageUri = encodePathAsUrl(
  __dirname,
  'static/welcome-illustration-right.svg'
)
export const WelcomeLeftTopImageUri = encodePathAsUrl(
  __dirname,
  'static/welcome-illustration-left-top.svg'
)
export const WelcomeLeftBottomImageUri = encodePathAsUrl(
  __dirname,
  'static/welcome-illustration-left-bottom.svg'
)

/** The Welcome flow. */
export class Welcome extends React.Component<IWelcomeProps, IWelcomeState> {
  public constructor(props: IWelcomeProps) {
    super(props)

    this.state = {
      currentStep: WelcomeStep.Start,
      exiting: false,
    }
  }

  public componentWillReceiveProps(nextProps: IWelcomeProps) {
    this.advanceOnSuccessfulSignIn(nextProps)
  }

  public componentDidMount() {
    this.props.dispatcher.recordWelcomeWizardInitiated()
  }

  /**
   * Returns a value indicating whether or not the welcome flow is
   * currently in one of the sign in steps, i.e. either dotcom sign
   * in or enterprise sign in.
   */
  private get inSignInStep() {
    if (this.state.currentStep === WelcomeStep.SignInToDotComWithBrowser) {
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
   * signed in successfully. If both conditions hold true we move
   * the user to the configure git step.
   */
  private advanceOnSuccessfulSignIn(nextProps: IWelcomeProps) {
    // If we're not currently in a sign in flow we don't care about
    // new props
    if (!this.inSignInStep) {
      log.info(`[Welcome] no sign in step found. ignoring...`)
      return
    }

    // We need to currently have a sign in state _and_ receive a new
    // one in order to be able to make any sort of determination about
    // what's going on in the sign in flow.
    if (!this.props.signInState) {
      log.info(`[Welcome] current sign in state not found. ignoring...`)
      return
    }

    if (!nextProps.signInState) {
      log.info(`[Welcome] next sign in state not found. ignoring...`)
      return
    }

    // Only advance when the state first changes...
    if (this.props.signInState.kind === nextProps.signInState.kind) {
      log.info(
        `[Welcome] kind ${this.props.signInState.kind} is the same as ${nextProps.signInState.kind}. ignoring...`
      )
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
    const signInState = this.props.signInState

    switch (step) {
      case WelcomeStep.Start:
      case WelcomeStep.SignInToDotComWithBrowser:
        const loadingBrowserAuth =
          step === WelcomeStep.SignInToDotComWithBrowser &&
          signInState !== null &&
          signInState.kind === SignInStep.Authentication &&
          signInState.loading

        return (
          <Start
            advance={this.advanceToStep}
            dispatcher={this.props.dispatcher}
            loadingBrowserAuth={loadingBrowserAuth}
          />
        )

      case WelcomeStep.SignInToEnterprise:
        return (
          <SignInEnterprise
            dispatcher={this.props.dispatcher}
            advance={this.advanceToStep}
            signInState={signInState}
          />
        )

      case WelcomeStep.ConfigureGit:
        return (
          <ConfigureGit
            advance={this.advanceToStep}
            accounts={this.props.accounts}
            done={this.done}
          />
        )

      default:
        return assertNever(step, `Unknown welcome step: ${step}`)
    }
  }

  private advanceToStep = (step: WelcomeStep) => {
    log.info(`[Welcome] advancing to step: ${step}`)
    if (step === WelcomeStep.SignInToEnterprise) {
      this.props.dispatcher.beginEnterpriseSignIn()
    }

    this.setState({ currentStep: step })
  }

  private done = () => {
    // Add a delay so that the exit animations (defined in css)
    // have time to run to completion.
    this.setState({ exiting: true }, () => {
      setTimeout(() => {
        this.props.dispatcher.endWelcomeFlow()
      }, 250)
    })
  }

  public render() {
    const className = classNames({
      exiting: this.state.exiting,
    })
    return (
      <UiView id="welcome" className={className}>
        <div className="welcome-left">
          <div className="welcome-content">
            {this.getComponentForCurrentStep()}
            <img className="welcome-graphic-top" src={WelcomeLeftTopImageUri} />
            <img
              className="welcome-graphic-bottom"
              src={WelcomeLeftBottomImageUri}
            />
          </div>
        </div>

        <div className="welcome-right">
          <img className="welcome-graphic" src={WelcomeRightImageUri} />
        </div>
      </UiView>
    )
  }
}
