import * as React from 'react'
import { LinkButton } from '../lib/link-button'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { Loading } from './loading'
import { Form } from './form'
import { Button } from './button'
import { TextBox } from './text-box'
import { Errors } from './errors'
import { getDotComAPIEndpoint } from '../../lib/api'
import { HorizontalRule } from './horizontal-rule'
import { PasswordTextBox } from './password-text-box'

/** Text to let the user know their browser will send them back to GH Desktop */
export const BrowserRedirectMessage =
  "Your browser will redirect you back to GitHub Desktop once you've signed in. If your browser asks for your permission to launch GitHub Desktop please allow it to."

interface IAuthenticationFormProps {
  /**
   * The URL to the host which we're currently authenticating
   * against. This will be either https://api.github.com when
   * signing in against GitHub.com or a user-specified
   * URL when signing in against a GitHub Enterprise
   * instance.
   */
  readonly endpoint: string

  /**
   * Does the server support basic auth?
   * If the server responds that it doesn't, the user will be prompted to use
   * that server's web sign in flow.
   *
   * ("Basic auth" is logging in via user + password entered directly in Desktop.)
   */
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

  /**
   * An array of additional buttons to render after the "Sign In" button.
   * (Usually, a 'cancel' button)
   */
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

  readonly forgotPasswordUrl: string
}

interface IAuthenticationFormState {
  readonly username: string
  readonly password: string
}

/** The GitHub authentication component. */
export class AuthenticationForm extends React.Component<
  IAuthenticationFormProps,
  IAuthenticationFormState
> {
  public constructor(props: IAuthenticationFormProps) {
    super(props)

    this.state = { username: '', password: '' }
  }

  public render() {
    const content = this.props.supportsBasicAuth
      ? this.renderSignInForm()
      : this.renderEndpointRequiresWebFlow()

    return (
      <Form className="sign-in-form" onSubmit={this.signIn}>
        {content}
      </Form>
    )
  }

  private renderUsernamePassword() {
    const disabled = this.props.loading
    return (
      <>
        <TextBox
          label="Username or email address"
          disabled={disabled}
          required={true}
          displayInvalidState={false}
          autoFocus={this.props.endpoint === getDotComAPIEndpoint()}
          onValueChanged={this.onUsernameChange}
        />

        <PasswordTextBox
          label="Password"
          disabled={disabled}
          required={true}
          displayInvalidState={false}
          onValueChanged={this.onPasswordChange}
        />

        {this.renderError()}

        <div className="sign-in-footer">{this.renderActions()}</div>
      </>
    )
  }

  private renderActions() {
    const signInDisabled = Boolean(
      !this.state.username.length ||
        !this.state.password.length ||
        this.props.loading
    )
    return (
      <div className="actions">
        {this.props.supportsBasicAuth ? (
          <Button type="submit" disabled={signInDisabled}>
            {this.props.loading ? <Loading /> : null} Sign in
          </Button>
        ) : null}

        {this.props.additionalButtons}

        {this.props.supportsBasicAuth ? (
          <LinkButton
            className="forgot-password-link"
            uri={this.props.forgotPasswordUrl}
          >
            Forgot password?
          </LinkButton>
        ) : null}
      </div>
    )
  }

  /**
   * Show the sign in locally form
   *
   * Also displays an option to sign in with browser for
   * enterprise users (but not for dot com users since
   * they will have already been offered this option
   * earlier in the UI flow).
   */
  private renderSignInForm() {
    return this.props.endpoint === getDotComAPIEndpoint() ? (
      this.renderUsernamePassword()
    ) : (
      <>
        {this.renderSignInWithBrowserButton()}
        <HorizontalRule title="or" />
        {this.renderUsernamePassword()}
      </>
    )
  }

  /**
   * Show a message informing the user they must sign in via the web flow
   * and a button to do so
   */
  private renderEndpointRequiresWebFlow() {
    return (
      <>
        {getEndpointRequiresWebFlowMessage(this.props.endpoint)}
        {this.renderSignInWithBrowserButton()}
        {this.props.additionalButtons}
      </>
    )
  }

  private renderSignInWithBrowserButton() {
    return (
      <Button
        type="submit"
        className="button-with-icon"
        onClick={this.signInWithBrowser}
        autoFocus={true}
        role="link"
      >
        Sign in using your browser
        <Octicon symbol={octicons.linkExternal} />
      </Button>
    )
  }

  private renderError() {
    const error = this.props.error
    if (!error) {
      return null
    }

    return <Errors>{error.message}</Errors>
  }

  private onUsernameChange = (username: string) => {
    this.setState({ username })
  }

  private onPasswordChange = (password: string) => {
    this.setState({ password })
  }

  private signInWithBrowser = (event?: React.MouseEvent<HTMLButtonElement>) => {
    if (event) {
      event.preventDefault()
    }
    this.props.onBrowserSignInRequested()
  }

  private signIn = () => {
    this.props.onSubmit(this.state.username, this.state.password)
  }
}

function getEndpointRequiresWebFlowMessage(endpoint: string): JSX.Element {
  if (endpoint === getDotComAPIEndpoint()) {
    return (
      <>
        <p>GitHub now requires you to sign in with your browser.</p>
        <p>{BrowserRedirectMessage}</p>
      </>
    )
  } else {
    return (
      <p>
        Your GitHub Enterprise instance requires you to sign in with your
        browser.
      </p>
    )
  }
}
