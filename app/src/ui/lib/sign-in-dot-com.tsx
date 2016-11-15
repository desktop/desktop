import * as React from 'react'
import { LinkButton } from '../lib/link-button'
import { Button } from '../lib/button'
import {
  getDotComAPIEndpoint,
  createAuthorization,
  AuthorizationResponse,
  fetchUser,
  AuthorizationResponseKind,
} from '../../lib/api'
import { User } from '../../models/user'
import { assertNever } from '../../lib/fatal-error'

const ForgotPasswordURL = 'https://github.com/password_reset'

interface ISignInDotComProps {
  /**
   * Called when the user chooses to use OAuth. It should open the browser to
   * start the OAuth dance.
   */
  readonly onSignInWithBrowser: () => void

  /** Called after the user has signed in. */
  readonly onDidSignIn: (user: User) => void

  /** Called when two-factor authentication is required. */
  readonly onNeeds2FA: (login: string, password: string) => void

  /** An array of additional buttons to render after the "Sign In" button. */
  readonly additionalButtons?: ReadonlyArray<JSX.Element>
}

interface ISignInDotComState {
  readonly username: string
  readonly password: string

  readonly networkRequestInFlight: boolean
  readonly response: AuthorizationResponse | null
}

/** The GitHub.com sign in component. */
export class SignInDotCom extends React.Component<ISignInDotComProps, ISignInDotComState> {
  public constructor(props: ISignInDotComProps) {
    super(props)

    this.state = { username: '', password: '', networkRequestInFlight: false, response: null }
  }

  public render() {
    const signInDisabled = Boolean(!this.state.username.length || !this.state.password.length)
    return (
      <form id='sign-in-form' onSubmit={e => this.signIn(e)}>
        <label>Username or email address
          <input autoFocus={true} onChange={e => this.onUsernameChange(e)}/>
        </label>

        <label>Password
          <input type='password' onChange={e => this.onPasswordChange(e)}/>
        </label>

        {this.renderError()}

        <LinkButton uri={ForgotPasswordURL}>Forgot password?</LinkButton>

        <div className='actions'>
          <Button type='submit' disabled={signInDisabled}>Sign in</Button>
          {this.props.additionalButtons}
        </div>

        <div>or</div>

        <LinkButton onClick={() => this.props.onSignInWithBrowser()}>Sign in using your browser</LinkButton>
      </form>
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

  private onUsernameChange(event: React.FormEvent<HTMLInputElement>) {
    this.setState({
      username: event.currentTarget.value,
      password: this.state.password,
      networkRequestInFlight: this.state.networkRequestInFlight,
      response: null,
    })
  }

  private onPasswordChange(event: React.FormEvent<HTMLInputElement>) {
    this.setState({
      username: this.state.username,
      password: event.currentTarget.value,
      networkRequestInFlight: this.state.networkRequestInFlight,
      response: null,
    })
  }

  private async signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const username = this.state.username
    const password = this.state.password
    this.setState({
      username,
      password,
      networkRequestInFlight: true,
      response: null,
    })

    const endpoint = getDotComAPIEndpoint()
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
