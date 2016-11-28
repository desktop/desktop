import * as React from 'react'
import { createAuthorization, AuthorizationResponse, fetchUser, AuthorizationResponseKind } from '../../lib/api'
import { User } from '../../models/user'
import { Button } from './button'
import { assertNever } from '../../lib/fatal-error'

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
}

/** The two-factor authentication component. */
export class TwoFactorAuthentication extends React.Component<ITwoFactorAuthenticationProps, ITwoFactorAuthenticationState> {
  public constructor(props: ITwoFactorAuthenticationProps) {
    super(props)

    this.state = { otp: '', response: null }
  }

  public render() {
    const disabled = !this.state.otp.length
    return (
      <div>
        <p className='welcome-text'>
          Open the two-factor authentication app on your device to view your
          authentication code and verify your identity.
        </p>

        <form id='2fa-form' className='sign-in-form' onSubmit={this.signIn}>
          <div className='field-group'>
            <label htmlFor='two-factor-code'>Authentication code</label>
            <input id='two-factor-code' className='text-field sign-in-field' autoFocus={true} onChange={this.onOTPChange}/>
          </div>

          {this.renderError()}

          <div className='actions'>
            <Button type='submit' disabled={disabled}>Verify</Button>
          </div>
        </form>
      </div>
    )
  }

  private renderError() {
    const response = this.state.response
    if (!response) { return null }

    const kind = response.kind
    switch (kind) {
      case AuthorizationResponseKind.Authorized: return null
      case AuthorizationResponseKind.Failed: return <div className='form-errors'>Failed</div>
      case AuthorizationResponseKind.TwoFactorAuthenticationRequired: return <div className='form-errors'>2fa</div>
      case AuthorizationResponseKind.Error: return <div className='form-errors'>Error</div>
      default: return assertNever(kind, `Unknown response kind: ${kind}`)
    }
  }

  private onOTPChange = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({
      otp: event.currentTarget.value,
      response: null,
    })
  }

  private signIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const response = await createAuthorization(this.props.endpoint, this.props.login, this.props.password, this.state.otp)
    if (response.kind === AuthorizationResponseKind.Authorized) {
      const token = response.token
      const user = await fetchUser(this.props.endpoint, token)
      this.props.onDidSignIn(user)
    } else {
      this.setState({
        otp: this.state.otp,
        response,
      })
    }
  }
}
