import * as React from 'react'
import { LinkButton } from '../lib/link-button'
import { Button } from '../lib/button'
import {
  createAuthorization,
  AuthorizationResponse,
  fetchUser,
  AuthorizationResponseKind,
  getHTMLURL,
} from '../../lib/api'
import { User } from '../../models/user'
import { assertNever } from '../../lib/fatal-error'
import { askUserToOAuth } from '../../lib/oauth'

interface IAuthenticationFormProps {
  /** The endpoint against which the user is authenticating. */
  readonly endpoint: string

  /** Does the server support basic auth? */
  readonly supportsBasicAuth: boolean

  /** Called after the user has signed in. */
  readonly onDidSignIn: (user: User) => void

  /** Called when two-factor authentication is required. */
  readonly onNeeds2FA: (login: string, password: string) => void

  /** An array of additional buttons to render after the "Sign In" button. */
  readonly additionalButtons?: ReadonlyArray<JSX.Element>
}

interface IAuthenticationFormState {
  readonly username: string
  readonly password: string

  readonly networkRequestInFlight: boolean
  readonly response: AuthorizationResponse | null
}

/** The GitHub authentication component. */
export class AuthenticationForm extends React.Component<IAuthenticationFormProps, IAuthenticationFormState> {
  public constructor(props: IAuthenticationFormProps) {
    super(props)

    this.state = { username: '', password: '', networkRequestInFlight: false, response: null }
  }

  public render() {
    return (
      <form id='sign-in-form' onSubmit={this.signIn}>
        {this.renderUsernamePassword()}

        {this.renderError()}

        {this.props.supportsBasicAuth ? <div>or</div> : null}

        {this.renderSignInWithBrowser()}
      </form>
    )
  }

  private renderUsernamePassword() {
    if (!this.props.supportsBasicAuth) { return null }

    return (
      <div>
        <label>Username or email address
          <input autoFocus={true} onChange={this.onUsernameChange}/>
        </label>

        <label>Password
          <input type='password' onChange={this.onPasswordChange}/>
        </label>

        <LinkButton uri={this.getForgotPasswordURL()}>Forgot password?</LinkButton>

        {this.renderActions()}
      </div>
    )
  }

  private renderActions() {
    const signInDisabled = Boolean(!this.state.username.length || !this.state.password.length)
    return (
      <div className='actions'>
        {this.props.supportsBasicAuth ? <Button type='submit' disabled={signInDisabled}>Sign in</Button> : null}
        {this.props.additionalButtons}
      </div>
    )
  }

  private renderSignInWithBrowser() {
    return (
      <div>
        <LinkButton onClick={this.signInWithBrowser}>Sign in using your browser</LinkButton>

        {this.props.supportsBasicAuth ? null : this.renderActions()}
      </div>
    )
  }

  private renderError() {
    const response = this.state.response
    if (!response) { return null }

    const kind = response.kind
    switch (kind) {
      case AuthorizationResponseKind.Failed: return <div>The username or password are incorrect.</div>
      case AuthorizationResponseKind.Error: return <div>An error occurred.</div>
      case AuthorizationResponseKind.TwoFactorAuthenticationRequired: return null
      case AuthorizationResponseKind.Authorized: return null
      default: return assertNever(kind, `Unknown response kind: ${kind}`)
    }
  }

  private getForgotPasswordURL(): string {
    return `${getHTMLURL(this.props.endpoint)}/password_reset`
  }

  private onUsernameChange = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({
      username: event.currentTarget.value,
      password: this.state.password,
      networkRequestInFlight: this.state.networkRequestInFlight,
      response: null,
    })
  }

  private onPasswordChange = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({
      username: this.state.username,
      password: event.currentTarget.value,
      networkRequestInFlight: this.state.networkRequestInFlight,
      response: null,
    })
  }

  private signInWithBrowser = async () => {
    const user = await askUserToOAuth(this.props.endpoint)
    this.props.onDidSignIn(user)
  }

  private signIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const username = this.state.username
    const password = this.state.password
    this.setState({
      username,
      password,
      networkRequestInFlight: true,
      response: null,
    })

    const endpoint = this.props.endpoint
    const response = await createAuthorization(endpoint, username, password, null)

    if (response.kind === AuthorizationResponseKind.Authorized) {
      const token = response.token
      const user = await fetchUser(endpoint, token)
      this.props.onDidSignIn(user)
    } else if (response.kind === AuthorizationResponseKind.TwoFactorAuthenticationRequired) {
      this.props.onNeeds2FA(username, password)
    } else {
      this.setState({
        username,
        password,
        networkRequestInFlight: false,
        response,
      })
    }
  }
}
