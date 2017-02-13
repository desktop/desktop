import * as React from 'react'
import { createAuthorization, AuthorizationResponse, fetchUser, AuthorizationResponseKind } from '../../lib/api'
import { User } from '../../models/user'
import { assertNever } from '../../lib/fatal-error'
import { Loading } from './loading'
import { Button } from './button'
import { TextBox } from './text-box'
import { Form } from './form'
import { Errors } from './errors'

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
      <div>
        <p className='welcome-text'>
          Open the two-factor authentication app on your device to view your
          authentication code and verify your identity.
        </p>

        <Form onSubmit={this.signIn}>
          <TextBox
            label='Authentication code'
            disabled={textEntryDisabled}
            autoFocus={true}
            onChange={this.onOTPChange}/>

          {this.renderError()}

          <Button type='submit' disabled={signInDisabled}>Verify</Button>

          {this.state.loading ? <Loading/> : null}
        </Form>
      </div>
    )
  }

  private renderError() {
    const response = this.state.response
    if (!response) { return null }

    switch (response.kind) {
      case AuthorizationResponseKind.Authorized: return null
      case AuthorizationResponseKind.Failed: return <Errors>Failed</Errors>
      case AuthorizationResponseKind.TwoFactorAuthenticationRequired: return <Errors>2fa</Errors>
      case AuthorizationResponseKind.Error: {
        const error = response.response.error
        if (error) {
          return <Errors>An error occurred: {error.message}</Errors>
        } else {
          return <Errors>An unknown error occurred: {response.response.statusCode}: {response.response.body}</Errors>
        }
      }
      default: return assertNever(response, `Unknown response: ${response}`)
    }
  }

  private onOTPChange = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({
      otp: event.currentTarget.value,
      response: null,
      loading: false,
    })
  }

  private signIn = async () => {
    this.setState({
      otp: this.state.otp,
      response: null,
      loading: true,
    })

    const response = await createAuthorization(this.props.endpoint, this.props.login, this.props.password, this.state.otp)
    if (response.kind === AuthorizationResponseKind.Authorized) {
      const token = response.token
      const user = await fetchUser(this.props.endpoint, token)
      if (user) {
        this.props.onDidSignIn(user)
      } else {
        console.error('TODO: what about if we get a null user here?')
      }
    } else {
      this.setState({
        otp: this.state.otp,
        response,
        loading: false,
      })
    }
  }
}
