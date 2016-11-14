import * as React from 'react'
import { LinkButton } from '../lib/link-button'
import { Button } from '../lib/button'
import { createAuthorization } from '../../lib/api'

const ForgotPasswordURL = 'https://github.com/password_reset'

interface ISignInDotComProps {
  readonly onSignInWithBrowser: () => void

  readonly additionalButtons?: ReadonlyArray<JSX.Element>
}

interface ISignInDotComState {
  readonly username: string
  readonly password: string
}

/** The GitHub.com sign in component. */
export class SignInDotCom extends React.Component<ISignInDotComProps, ISignInDotComState> {
  public constructor(props: ISignInDotComProps) {
    super(props)

    this.state = { username: '', password: '' }
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
    })
  }

  private onPasswordChange(event: React.FormEvent<HTMLInputElement>) {
    this.setState({
      username: this.state.username,
      password: event.currentTarget.value,
    })
  }

  private async signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const response = await createAuthorization('https://api.github.com', this.state.username, this.state.password, null)
    console.log(response)

    // TODO: Actually sign in lolololol
  }
}
