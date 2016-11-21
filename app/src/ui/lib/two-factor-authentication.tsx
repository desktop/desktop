import * as React from 'react'
import { createAuthorization, AuthorizationResponse, fetchUser, AuthorizationResponseKind } from '../../lib/api'
import { User } from '../../models/user'
import { Button } from './button'
import { assertNever } from '../../lib/fatal-error'
import { Loading } from './loading'

interface ITwoFactorAuthenticationProps {
  /** The endpoint to authenticate against. */
  readonly endpoint: string

  /** The login to authenticate with. */
  readonly login: string

  /** The password to authenticate with. */
  readonly password: string

  /** Called after successfully authenticating. */
  readonly onDidSignIn: (user: User) => void
}

interface ITwoFactorAuthenticationState {
  readonly otp: string
  readonly response: AuthorizationResponse | null
  readonly loading: boolean
}

/** The two-factor authentication component. */
export class TwoFactorAuthentication extends React.Component<ITwoFactorAuthenticationProps, ITwoFactorAuthenticationState> {
  public constructor(props: ITwoFactorAuthenticationProps) {
    super(props)

    this.state = { otp: '', response: null, loading: false }
  }

  public render() {
    const textEntryDisabled = this.state.loading
    const signInDisabled = !this.state.otp.length || this.state.loading
    return (
      <form id='2fa-form' onSubmit={this.signIn}>
        <label>Authentication code
          <input disabled={textEntryDisabled} autoFocus={true} onChange={this.onOTPChange}/>
        </label>

        {this.renderError()}

        <Button type='submit' disabled={signInDisabled}>Sign In</Button>

        {this.state.loading ? <Loading/> : null}
      </form>
    )
  }

  private renderError() {
    const response = this.state.response
    if (!response) { return null }

    switch (response.kind) {
      case AuthorizationResponseKind.Authorized: return null
      case AuthorizationResponseKind.Failed: return <div>Failed</div>
      case AuthorizationResponseKind.TwoFactorAuthenticationRequired: return <div>2fa</div>
      case AuthorizationResponseKind.Error: {
        const error = response.response.error
        if (error) {
          return <div>An error occurred: {error.message}</div>
        } else {
          return <div>An unknown error occurred: {response.response.statusCode}: {response.response.body}</div>
        }
      }
      default: return assertNever(response, `Unknown response kind: ${response}`)
    }
  }

  private onOTPChange = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({
      otp: event.currentTarget.value,
      response: null,
      loading: false,
    })
  }

  private signIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    this.setState({
      otp: this.state.otp,
      response: null,
      loading: true,
    })

    const response = await createAuthorization(this.props.endpoint, this.props.login, this.props.password, this.state.otp)
    if (response.kind === AuthorizationResponseKind.Authorized) {
      const token = response.token
      const user = await fetchUser(this.props.endpoint, token)
      this.props.onDidSignIn(user)
    } else {
      this.setState({
        otp: this.state.otp,
        response,
        loading: false,
      })
    }
  }
}
