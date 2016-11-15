import * as React from 'react'
import { createAuthorization, AuthorizationResponse, fetchUser } from '../../lib/api'
import { User } from '../../models/user'
import { Button } from './button'
import { assertNever } from '../../lib/fatal-error'

interface ITwoFactorAuthenticationProps {
  readonly endpoint: string
  readonly login: string
  readonly password: string

  readonly onDidSignIn: (user: User) => void
}

interface ITwoFactorAuthenticationState {
  readonly otp: string
  readonly response: AuthorizationResponse | null
}

export class TwoFactorAuthentication extends React.Component<ITwoFactorAuthenticationProps, ITwoFactorAuthenticationState> {
  public constructor(props: ITwoFactorAuthenticationProps) {
    super(props)

    this.state = { otp: '', response: null }
  }

  public render() {
    const disabled = !this.state.otp.length
    return (
      <form id='2fa-form' onSubmit={e => this.signIn(e)}>
        <label>Authentication code
          <input autoFocus={true} onChange={e => this.onOTPChange(e)}/>
        </label>

        {this.renderError()}

        <Button type='submit' disabled={disabled}>Sign In</Button>
      </form>
    )
  }

  private renderError() {
    const response = this.state.response
    if (!response) { return null }

    const kind = response.kind
    switch (kind) {
      case 'authorized': return null
      case 'failed': return <div>Failed</div>
      case '2fa': return <div>2fa</div>
      case 'error': return <div>Error</div>
      default: return assertNever(kind, `Unknown response kind: ${kind}`)
    }
  }

  private onOTPChange(event: React.FormEvent<HTMLInputElement>) {
    this.setState({
      otp: event.currentTarget.value,
      response: null,
    })
  }

  private async signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const response = await createAuthorization(this.props.endpoint, this.props.login, this.props.password, this.state.otp)
    if (response.kind === 'authorized') {
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
