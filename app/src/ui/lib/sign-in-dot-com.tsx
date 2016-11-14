import * as React from 'react'
import { LinkButton } from '../lib/link-button'
import { Button } from '../lib/button'
import { getDotComAPIEndpoint, createAuthorization, AuthorizationResponse, fetchUser } from '../../lib/api'
import { User } from '../../models/user'

const ForgotPasswordURL = 'https://github.com/password_reset'

interface ISignInDotComProps {
  readonly onSignInWithBrowser: () => void
  readonly onDidSignIn: (user: User) => void

  readonly additionalButtons?: ReadonlyArray<JSX.Element>
}

interface ISignInDotComState {
  readonly username: string
  readonly password: string

  readonly response: AuthorizationResponse | null
}

/** The GitHub.com sign in component. */
export class SignInDotCom extends React.Component<ISignInDotComProps, ISignInDotComState> {
  public constructor(props: ISignInDotComProps) {
    super(props)

    this.state = { username: '', password: '', response: null }
  }

  public render() {
    const signInDisabled = Boolean(!this.state.username.length || !this.state.password.length)
    return (
      <form id='sign-in-form' onSubmit={e => this.signIn(e)}>
        <label>Username or email address
          <input onChange={e => this.onUsernameChange(e)}/>
        </label>

        <label>Password
          <input type='password' onChange={e => this.onPasswordChange(e)}/>
        </label>

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

  private onUsernameChange(event: React.FormEvent<HTMLInputElement>) {
    this.setState({
      username: event.currentTarget.value,
      password: this.state.password,
      response: null,
    })
  }

  private onPasswordChange(event: React.FormEvent<HTMLInputElement>) {
    this.setState({
      username: this.state.username,
      password: event.currentTarget.value,
      response: null,
    })
  }

  private async signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const endpoint = getDotComAPIEndpoint()
    const response = await createAuthorization(endpoint, this.state.username, this.state.password, null)
    this.setState({
      username: this.state.username,
      password: this.state.password,
      response,
    })

    if (response.kind === 'authorized') {
      const token = response.token
      const user = await fetchUser(endpoint, token)
      this.props.onDidSignIn(user)
    }
  }
}
