import * as React from 'react'
import { LinkButton } from '../lib/link-button'
import { Octicon, OcticonSymbol } from '../octicons'
import { getHTMLURL } from '../../lib/api'
import { Loading } from './loading'
import { Form } from './form'
import { Button } from './button'
import { TextBox } from './text-box'
import { Errors } from './errors'

interface IAuthenticationFormProps {

  /** The endpoint against which the user is authenticating. */
  readonly endpoint: string

  /** Does the server support basic auth? */
  readonly supportsBasicAuth: boolean

  /**
   * A callback which is invoked once the user has entered a username
   * and password and submitted those either by clicking on the submit
   * button or by submitting the form through other means (ie hitting Enter).
   */
  readonly onSubmit: (username: string, password: string) => void

  /**
   * A callback which is invoked if the user requests OAuth sign in using
   * their system configured browser.
   */
  readonly onBrowserSignInRequested: () => void

  /** An array of additional buttons to render after the "Sign In" button. */
  readonly additionalButtons?: ReadonlyArray<JSX.Element>

  /**
   * An error which, if present, is presented to the
   * user in close proximity to the actions or input fields
   * related to the current step.
   */
  readonly error: Error | null

  /**
   * A value indicating whether or not the sign in store is
   * busy processing a request. While this value is true all
   * form inputs and actions save for a cancel action will
   * be disabled.
   */
  readonly loading: boolean
}

interface IAuthenticationFormState {
  readonly username: string
  readonly password: string
}

/** The GitHub authentication component. */
export class AuthenticationForm extends React.Component<IAuthenticationFormProps, IAuthenticationFormState> {
  public constructor(props: IAuthenticationFormProps) {
    super(props)

    this.state = { username: '', password: '' }
  }

  public render() {
    return (
      <Form className='sign-in-form' onSubmit={this.signIn}>
        {this.renderUsernamePassword()}

        {this.renderError()}

        {this.renderSignInWithBrowser()}
      </Form>
    )
  }

  private renderUsernamePassword() {
    if (!this.props.supportsBasicAuth) { return null }

    const disabled = this.props.loading
    return (
      <div>
        <TextBox
          label='Username or email address'
          disabled={disabled}
          autoFocus={true}
          onChange={this.onUsernameChange}/>

        <div className='password-container'>
          <TextBox
            label='Password'
            type='password'
            disabled={disabled}
            onChange={this.onPasswordChange}/>

          <LinkButton className='forgot-password-link' uri={this.getForgotPasswordURL()}>
            Forgot password?
          </LinkButton>
        </div>

        {this.renderActions()}
      </div>
    )
  }

  private renderActions() {
    const signInDisabled = Boolean(!this.state.username.length || !this.state.password.length || this.props.loading)
    return (
      <div className='actions'>
        {this.props.supportsBasicAuth ? <Button type='submit' disabled={signInDisabled}>Sign in</Button> : null}
        {this.props.additionalButtons}
        {this.props.loading ? <Loading/> : null}
      </div>
    )
  }

  private renderSignInWithBrowser() {
    const basicAuth = this.props.supportsBasicAuth
    return (
      <div>
        {basicAuth ? <div className='horizontal-rule'><span className='horizontal-rule-content'>or</span></div> : null}

        <p className='sign-in-footer'>
          <LinkButton className='welcome-link-button link-with-icon' onClick={this.signInWithBrowser}>
            Sign in using your browser
            <Octicon symbol={OcticonSymbol.linkExternal} />
          </LinkButton>
        </p>

        {basicAuth ? null : this.renderActions()}
      </div>
    )
  }

  private renderError() {
    const error = this.props.error
    if (!error) { return null }

    return <Errors>{error.message}</Errors>
  }

  private getForgotPasswordURL(): string {
    return `${getHTMLURL(this.props.endpoint)}/password_reset`
  }

  private onUsernameChange = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ username: event.currentTarget.value })
  }

  private onPasswordChange = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ password: event.currentTarget.value })
  }

  private signInWithBrowser = () => {
    this.props.onBrowserSignInRequested()
  }

  private signIn = () => {
    this.props.onSubmit(this.state.username, this.state.password)
  }
}
