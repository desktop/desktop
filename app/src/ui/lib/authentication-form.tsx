import * as React from 'react'
import { LinkButton } from '../lib/link-button'
import { Octicon, OcticonSymbol } from '../octicons'
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

  readonly loading: boolean
  readonly response: AuthorizationResponse | null
}

/** The GitHub authentication component. */
export class AuthenticationForm extends React.Component<IAuthenticationFormProps, IAuthenticationFormState> {
  public constructor(props: IAuthenticationFormProps) {
    super(props)

    this.state = { username: '', password: '', loading: false, response: null }
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

    const disabled = this.state.loading
    return (
      <div>
        <TextBox
          label='Username or email address'
          disabled={disabled}
          autoFocus={true}
          onChange={this.onUsernameChange}/>

        <TextBox
          label='Password'
          type='password'
          disabled={disabled}
          onChange={this.onPasswordChange}
          labelLinkText='Forgot password?'
          labelLinkUri={this.getForgotPasswordURL()}/>

        {this.renderActions()}
      </div>
    )
  }

  private renderActions() {
    const signInDisabled = Boolean(!this.state.username.length || !this.state.password.length || this.state.loading)
    return (
      <div className='actions'>
        {this.props.supportsBasicAuth ? <Button type='submit' disabled={signInDisabled}>Sign in</Button> : null}
        {this.props.additionalButtons}
        {this.state.loading ? <Loading/> : null}
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
    const response = this.state.response
    if (!response) { return null }

    switch (response.kind) {
      case AuthorizationResponseKind.Failed: return <Errors>The username or password are incorrect.</Errors>
      case AuthorizationResponseKind.Error: {
        const error = response.response.error
        if (error) {
          return <Errors>An error occurred: {error.message}</Errors>
        } else {
          return <Errors>An unknown error occurred: {response.response.statusCode}: {response.response.body}</Errors>
        }
      }
      case AuthorizationResponseKind.TwoFactorAuthenticationRequired: return null
      case AuthorizationResponseKind.Authorized: return null
      default: return assertNever(response, `Unknown response: ${response}`)
    }
  }

  private getForgotPasswordURL(): string {
    return `${getHTMLURL(this.props.endpoint)}/password_reset`
  }

  private onUsernameChange = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({
      username: event.currentTarget.value,
      password: this.state.password,
      loading: this.state.loading,
      response: null,
    })
  }

  private onPasswordChange = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({
      username: this.state.username,
      password: event.currentTarget.value,
      loading: this.state.loading,
      response: null,
    })
  }

  private signInWithBrowser = async () => {
    const user = await askUserToOAuth(this.props.endpoint)
    this.props.onDidSignIn(user)
  }

  private signIn = async () => {
    const username = this.state.username
    const password = this.state.password
    this.setState({
      username,
      password,
      loading: true,
      response: null,
    })

    const endpoint = this.props.endpoint
    const response = await createAuthorization(endpoint, username, password, null)

    if (response.kind === AuthorizationResponseKind.Authorized) {
      const token = response.token
      const user = await fetchUser(endpoint, token)
      if (user) {
        this.props.onDidSignIn(user)
      } else {
        console.error('TODO: what about if we get a null user here?')
      }
    } else if (response.kind === AuthorizationResponseKind.TwoFactorAuthenticationRequired) {
      this.props.onNeeds2FA(username, password)
    } else {
      this.setState({
        username,
        password,
        loading: false,
        response,
      })
    }
  }
}
