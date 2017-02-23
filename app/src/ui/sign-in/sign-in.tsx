import * as React from 'react'
import {
  Dispatcher,
  SignInState,
  SignInStep,
  IEndpointEntryState,
  IAuthenticationState,
  ITwoFactorAuthenticationState,
  AuthenticationMethods,
} from '../../lib/dispatcher'
import { assertNever } from '../../lib/fatal-error'
import { Button } from '../lib/button'
import { LinkButton } from '../lib/link-button'
import { Octicon, OcticonSymbol } from '../octicons'
import { Row } from '../lib/row'
import { TextBox } from '../lib/text-box'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogError, DialogContent, DialogFooter } from '../dialog'

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

export class SignIn extends React.Component<ISignInProps, ISignInState> {

  public constructor(props: ISignInProps) {
    super(props)

    this.state = {
      endpoint: '',
      username: '',
      password: '',
      otpToken: '',
    }
  }

  public componentWillReceiveProps(nextProps: ISignInProps) {
    if (nextProps.signInState !== this.props.signInState) {
      if (nextProps.signInState && nextProps.signInState.kind === SignInStep.Success) {
        this.props.onDismissed()
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
        if (state.authMethods.has(AuthenticationMethods.OAuth) && !state.authMethods.has(AuthenticationMethods.BasicAuth)) {
          this.props.dispatcher.requestBrowserAuthentication()
        } else {
          this.props.dispatcher.setSignInCredentials(this.state.username, this.state.password)
        }
        break
      case SignInStep.TwoFactorAuthentication:
        this.props.dispatcher.setSignInOTP(this.state.otpToken)
        break
      case SignInStep.Success:
        this.props.onDismissed()
        break
      default:
        return assertNever(state, `Unknown sign in step ${stepKind}`)
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

  private renderErrors() {
    if (!this.props.signInState || this.props.signInState.kind === SignInStep.Success || !this.props.signInState.error) {
      return null
    }

    const error = this.props.signInState.error

    return <DialogError>{error.message}</DialogError>
  }

  private renderFooter(): JSX.Element | null {

    const state = this.props.signInState

    if (!state || state.kind === SignInStep.Success) {
      return null
    }

    let primaryButtonText: string
    const stepKind = state.kind

    switch (state.kind) {
      case SignInStep.EndpointEntry:
        primaryButtonText = 'Continue'
        break
      case SignInStep.TwoFactorAuthentication:
        primaryButtonText = 'Sign in'
        break
      case SignInStep.Authentication:
        if (state.authMethods.has(AuthenticationMethods.OAuth) && !state.authMethods.has(AuthenticationMethods.BasicAuth)) {
          primaryButtonText = 'Continue with browser'
        } else {
          primaryButtonText = 'Sign in'
        }
        break
      default:
        return assertNever(state, `Unknown sign in step ${stepKind}`)
    }

    return (
      <DialogFooter>
        <ButtonGroup>
          <Button type='submit'>{primaryButtonText}</Button>
          <Button onClick={this.props.onDismissed}>Cancel</Button>
        </ButtonGroup>
      </DialogFooter>
    )
  }

  private renderEndpointEntryStep(state: IEndpointEntryState) {
    return (
      <DialogContent>
        <Row>
          <TextBox
            label='Enterprise server address'
            value={this.state.endpoint}
            onValueChanged={this.onEndpointChanged}
          />
        </Row>
      </DialogContent>
    )
  }

  private renderSignInWithBrowser() {
    return (
      <div>
        <Row>
          <div className='horizontal-rule'><span className='horizontal-rule-content'>or</span></div>
        </Row>
        <Row className='sign-in-with-browser'>
          <LinkButton className='link-with-icon' onClick={this.onSignInWithBrowser}>
            Sign in using your browser
            <Octicon symbol={OcticonSymbol.linkExternal} />
          </LinkButton>
        </Row>
      </div>
    )
  }

  private renderAuthenticationStep(state: IAuthenticationState) {

    if (state.authMethods.has(AuthenticationMethods.OAuth) && !state.authMethods.has(AuthenticationMethods.BasicAuth)) {
      return (
        <DialogContent>
          <p>
            Your GitHub Enterprise instance requires you to sign in with your browser.
          </p>
        </DialogContent>
      )
    }

    const signInWithBrowser = state.authMethods.has(AuthenticationMethods.OAuth)
      ? this.renderSignInWithBrowser()
      : null

    return (
      <DialogContent>
        <Row>
          <TextBox
            label='Username or email address'
            value={this.state.username}
            onValueChanged={this.onUsernameChanged}
          />
        </Row>
        <Row>
          <TextBox
            label='Password'
            value={this.state.password}
            type='password'
            onValueChanged={this.onPasswordChanged}
          />
        </Row>
        <Row className='forgot-password-row'>
          <LinkButton uri={state.forgotPasswordUrl}>Forgot password?</LinkButton>
        </Row>
        {signInWithBrowser}
      </DialogContent>
    )
  }

  private renderTwoFactorAuthenticationStep(state: ITwoFactorAuthenticationState) {
    return (
      <DialogContent>
        <p>
          Open the two-factor authentication app on your device to view your
          authentication code and verify your identity.
          {' '}<LinkButton uri='https://help.github.com/articles/providing-your-2fa-authentication-code/'>What's this?</LinkButton>
        </p>
        <Row>
          <TextBox
            label='Authentication code'
            value={this.state.otpToken}
            onValueChanged={this.onOTPTokenChanged}
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
      case SignInStep.EndpointEntry: return this.renderEndpointEntryStep(state)
      case SignInStep.Authentication: return this.renderAuthenticationStep(state)
      case SignInStep.TwoFactorAuthentication: return this.renderTwoFactorAuthenticationStep(state)
      case SignInStep.Success: return null
      default: return assertNever(state, `Unknown sign in step ${stepKind}`)
    }
  }

  public render() {

    const state = this.props.signInState

    if (!state || state.kind === SignInStep.Success) {
      return null
    }

    const disabled = state.loading

    return (
      <Dialog
        id='sign-in'
        title='Sign in'
        disabled={disabled}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
      >
        {this.renderErrors()}
        {this.renderStep()}
        {this.renderFooter()}
      </Dialog>
    )
  }
}
