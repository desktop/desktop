/* eslint-disable jsx-a11y/no-autofocus */
import * as React from 'react'
import { Dispatcher } from '../dispatcher'
import {
  SignInState,
  SignInStep,
  IEndpointEntryState,
  IAuthenticationState,
  ITwoFactorAuthenticationState,
} from '../../lib/stores'
import { assertNever } from '../../lib/fatal-error'
import { LinkButton } from '../lib/link-button'
import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { Row } from '../lib/row'
import { TextBox } from '../lib/text-box'
import { Dialog, DialogError, DialogContent, DialogFooter } from '../dialog'

import { getWelcomeMessage } from '../../lib/2fa'
import { getDotComAPIEndpoint } from '../../lib/api'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Button } from '../lib/button'

interface ISignInProps {
  readonly dispatcher: Dispatcher
  readonly signInState: SignInState | null
  readonly onDismissed: () => void
}

interface ISignInState {
  readonly endpoint: string
  readonly username: string
  readonly password: string
  readonly otpToken: string
}

const SignInWithBrowserTitle = __DARWIN__
  ? 'Sign in Using Your Browser'
  : 'Sign in using your browser'

const DefaultTitle = 'Sign in'

export class SignIn extends React.Component<ISignInProps, ISignInState> {
  private readonly dialogRef = React.createRef<Dialog>()

  public constructor(props: ISignInProps) {
    super(props)

    this.state = {
      endpoint: '',
      username: '',
      password: '',
      otpToken: '',
    }
  }

  public componentDidUpdate(prevProps: ISignInProps) {
    // Whenever the sign in step changes we replace the dialog contents which
    // means we need to re-focus the first suitable child element as it's
    // essentially a "new" dialog we're showing only the dialog component itself
    // doesn't know that.
    if (prevProps.signInState !== null && this.props.signInState !== null) {
      if (prevProps.signInState.kind !== this.props.signInState.kind) {
        this.dialogRef.current?.focusFirstSuitableChild()
      }
    }
  }

  public componentWillReceiveProps(nextProps: ISignInProps) {
    if (nextProps.signInState !== this.props.signInState) {
      if (
        nextProps.signInState &&
        nextProps.signInState.kind === SignInStep.Success
      ) {
        this.onDismissed()
      }
    }
  }

  private onSubmit = () => {
    const state = this.props.signInState

    if (!state) {
      return
    }

    const stepKind = state.kind

    switch (state.kind) {
      case SignInStep.EndpointEntry:
        this.props.dispatcher.setSignInEndpoint(this.state.endpoint)
        break
      case SignInStep.Authentication:
        if (!state.supportsBasicAuth) {
          this.props.dispatcher.requestBrowserAuthentication()
        } else {
          this.props.dispatcher.setSignInCredentials(
            this.state.username,
            this.state.password
          )
        }
        break
      case SignInStep.TwoFactorAuthentication:
        this.props.dispatcher.setSignInOTP(this.state.otpToken)
        break
      case SignInStep.Success:
        this.onDismissed()
        break
      default:
        assertNever(state, `Unknown sign in step ${stepKind}`)
    }
  }

  private onEndpointChanged = (endpoint: string) => {
    this.setState({ endpoint })
  }

  private onUsernameChanged = (username: string) => {
    this.setState({ username })
  }

  private onPasswordChanged = (password: string) => {
    this.setState({ password })
  }

  private onOTPTokenChanged = (otpToken: string) => {
    this.setState({ otpToken })
  }

  private onSignInWithBrowser = () => {
    this.props.dispatcher.requestBrowserAuthentication()
  }

  private renderFooter(): JSX.Element | null {
    const state = this.props.signInState

    if (!state || state.kind === SignInStep.Success) {
      return null
    }

    let disableSubmit = false

    let primaryButtonText: string
    const stepKind = state.kind

    switch (state.kind) {
      case SignInStep.EndpointEntry:
        disableSubmit = this.state.endpoint.length === 0
        primaryButtonText = 'Continue'
        break
      case SignInStep.TwoFactorAuthentication:
        // ensure user has entered non-whitespace characters
        const codeProvided = /\S+/.test(this.state.otpToken)
        disableSubmit = !codeProvided
        primaryButtonText = 'Sign in'
        break
      case SignInStep.Authentication:
        if (!state.supportsBasicAuth) {
          primaryButtonText = __DARWIN__
            ? 'Continue With Browser'
            : 'Continue with browser'
        } else {
          const validUserName = this.state.username.length > 0
          const validPassword = this.state.password.length > 0
          disableSubmit = !validUserName || !validPassword
          primaryButtonText = 'Sign in'
        }
        break
      default:
        return assertNever(state, `Unknown sign in step ${stepKind}`)
    }

    return (
      <DialogFooter>
        <OkCancelButtonGroup
          okButtonText={primaryButtonText}
          okButtonDisabled={disableSubmit}
          onCancelButtonClick={this.onDismissed}
        />
      </DialogFooter>
    )
  }

  private renderEndpointEntryStep(state: IEndpointEntryState) {
    return (
      <DialogContent>
        <Row>
          <TextBox
            label="Enterprise address"
            value={this.state.endpoint}
            onValueChanged={this.onEndpointChanged}
            placeholder="https://github.example.com"
          />
        </Row>
      </DialogContent>
    )
  }

  private renderAuthenticationStep(state: IAuthenticationState) {
    if (!state.supportsBasicAuth) {
      if (state.endpoint === getDotComAPIEndpoint()) {
        return (
          <DialogContent>
            <p>
              To improve the security of your account, GitHub now requires you
              to sign in through your browser.
            </p>
            <p>
              Your browser will redirect you back to GitHub Desktop once you've
              signed in. If your browser asks for your permission to launch
              GitHub Desktop please allow it to.
            </p>
          </DialogContent>
        )
      } else {
        return (
          <DialogContent>
            <p>
              Your GitHub Enterprise instance requires you to sign in with your
              browser.
            </p>
          </DialogContent>
        )
      }
    }

    const disableSubmit = state.loading

    return (
      <DialogContent>
        <Row className="sign-in-with-browser">
          <Button
            className="button-with-icon button-component-primary"
            onClick={this.onSignInWithBrowser}
            disabled={disableSubmit}
          >
            Sign in using your browser
            <Octicon symbol={OcticonSymbol.linkExternal} />
          </Button>
        </Row>

        <div className="horizontal-rule">
          <span className="horizontal-rule-content">or</span>
        </div>

        <Row>
          <TextBox
            label="Username or email address"
            value={this.state.username}
            onValueChanged={this.onUsernameChanged}
          />
        </Row>
        <Row>
          <TextBox
            label="Password"
            value={this.state.password}
            type="password"
            onValueChanged={this.onPasswordChanged}
          />
        </Row>
        <Row>
          <LinkButton
            className="forgot-password-link-sign-in"
            uri={state.forgotPasswordUrl}
          >
            Forgot password?
          </LinkButton>
        </Row>
      </DialogContent>
    )
  }

  private renderTwoFactorAuthenticationStep(
    state: ITwoFactorAuthenticationState
  ) {
    return (
      <DialogContent>
        <p>{getWelcomeMessage(state.type)}</p>
        <Row>
          <TextBox
            label="Authentication code"
            value={this.state.otpToken}
            onValueChanged={this.onOTPTokenChanged}
            autoFocus={true}
          />
        </Row>
      </DialogContent>
    )
  }

  private renderStep(): JSX.Element | null {
    const state = this.props.signInState

    if (!state) {
      return null
    }

    const stepKind = state.kind

    switch (state.kind) {
      case SignInStep.EndpointEntry:
        return this.renderEndpointEntryStep(state)
      case SignInStep.Authentication:
        return this.renderAuthenticationStep(state)
      case SignInStep.TwoFactorAuthentication:
        return this.renderTwoFactorAuthenticationStep(state)
      case SignInStep.Success:
        return null
      default:
        return assertNever(state, `Unknown sign in step ${stepKind}`)
    }
  }

  public render() {
    const state = this.props.signInState

    if (!state || state.kind === SignInStep.Success) {
      return null
    }

    const disabled = state.loading

    const errors = state.error ? (
      <DialogError>{state.error.message}</DialogError>
    ) : null

    const title =
      this.props.signInState &&
      this.props.signInState.kind === SignInStep.Authentication &&
      !this.props.signInState.supportsBasicAuth
        ? SignInWithBrowserTitle
        : DefaultTitle

    return (
      <Dialog
        id="sign-in"
        title={title}
        disabled={disabled}
        onDismissed={this.onDismissed}
        onSubmit={this.onSubmit}
        loading={state.loading}
        ref={this.dialogRef}
      >
        {errors}
        {this.renderStep()}
        {this.renderFooter()}
      </Dialog>
    )
  }

  private onDismissed = () => {
    this.props.dispatcher.resetSignInState()
    this.props.onDismissed()
  }
}
