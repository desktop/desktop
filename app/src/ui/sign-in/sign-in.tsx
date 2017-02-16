import * as React from 'react'
import { Dispatcher, SignInStep, Step, IEndpointEntryStep, IAuthenticationStep, ITwoFactorAuthenticationStep } from '../../lib/dispatcher'
import { assertNever } from '../../lib/fatal-error'
import { Button } from '../lib/button'
import { Row } from '../lib/row'
import { TextBox } from '../lib/text-box'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogError, DialogContent, DialogFooter } from '../dialog'

interface ISignInProps {
  readonly dispatcher: Dispatcher
  readonly signInState: SignInStep | null
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
      if (nextProps.signInState && nextProps.signInState.kind === Step.Success) {
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
      case Step.EndpointEntry:
        this.props.dispatcher.setSignInEndpoint(this.state.endpoint)
        break
      case Step.Authentication:
        this.props.dispatcher.setSignInCredentials(this.state.username, this.state.password)
        break
      case Step.TwoFactorAuthentication:
        this.props.dispatcher.setSignInOTP(this.state.otpToken)
        break
      case Step.Success:
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

  private renderErrors() {
    if (!this.props.signInState || this.props.signInState.kind === Step.Success || !this.props.signInState.error) {
      return null
    }

    const error = this.props.signInState.error

    return <DialogError>{error.message}</DialogError>
  }

  private renderFooter(): JSX.Element | null {

    const state = this.props.signInState

    if (!state || state.kind === Step.Success) {
      return null
    }

    let primaryButtonText: string
    const stepKind = state.kind

    switch (state.kind) {
      case Step.EndpointEntry:
        primaryButtonText = 'Continue'
        break
      case Step.TwoFactorAuthentication:
      case Step.Authentication:
        primaryButtonText = 'Sign in'
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

  private renderEndpointEntryStep(step: IEndpointEntryStep) {
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

  private renderAuthenticationStep(step: IAuthenticationStep) {
    return (
      <DialogContent>
        <Row>
          <TextBox
            label='Username'
            value={this.state.username}
            onValueChanged={this.onUsernameChanged}
          />
        </Row>
        <Row>
          <TextBox
            label='Password'
            value={this.state.password}
            onValueChanged={this.onPasswordChanged}
          />
        </Row>
      </DialogContent>
    )
  }

  private renderTwoFactorAuthenticationStep(step: ITwoFactorAuthenticationStep) {
    // TODO: Add "What's this" link button
    return (
      <DialogContent>
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
      case Step.EndpointEntry: return this.renderEndpointEntryStep(state)
      case Step.Authentication: return this.renderAuthenticationStep(state)
      case Step.TwoFactorAuthentication: return this.renderTwoFactorAuthenticationStep(state)
      case Step.Success: return null
      default: return assertNever(state, `Unknown sign in step ${stepKind}`)
    }
  }

  public render() {

    const state = this.props.signInState

    if (!state || state.kind === Step.Success) {
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
