import * as React from 'react'
import { WelcomeStep } from './welcome'
import { Dispatcher } from '../../lib/dispatcher'
import { LinkButton } from '../lib/link-button'
import { Octicon, OcticonSymbol } from '../octicons'
import { Button } from '../lib/button'

const ForgotPasswordURL = 'https://github.com/password_reset'

interface ISignInDotComProps {
  readonly dispatcher: Dispatcher
  readonly advance: (step: WelcomeStep) => void
}

interface ISignInDotComState {
  readonly username: string
  readonly password: string
}

/** The Welcome flow step to login to GitHub.com. */
export class SignInDotCom extends React.Component<ISignInDotComProps, ISignInDotComState> {
  public constructor(props: ISignInDotComProps) {
    super(props)

    this.state = { username: '', password: '' }
  }

  public render() {
    // Always disabled as we don't support sign in in-app yet.
    const signInDisabled = Boolean(!this.state.username.length || !this.state.password.length) || true
    return (
      <div id='sign-in-dot-com'>
        <h1 className='welcome-title'>Sign in to GitHub.com</h1>
        <p className='welcome-text'>
          (But not really. Use the browser for now please and thank you.)
        </p>

        <form className='sign-in-form' onSubmit={e => this.signIn(e)}>
          <div className='field-group'>
            <label>Username or email address</label>
            <input className='text-field sign-in-field' type='email' onChange={e => this.onUsernameChange(e)}/>
          </div>

          <div className='field-group'>
            <label>Password</label>
            <input className='sign-in-field' type='password' onChange={e => this.onPasswordChange(e)}/>
          </div>

          <LinkButton className='forgot-password-link' uri={ForgotPasswordURL}>Forgot password?</LinkButton>

          <div className='actions'>
            <Button type='submit' disabled={signInDisabled}>Sign in </Button>
            <Button className='secondary-button' onClick={() => this.cancel()}>Cancel</Button>
          </div>

          <div className='horizontal-rule'>
            <span className='horizontal-rule-content'>or</span>
          </div>

          <p className='sign-in-footer'>
            <LinkButton className='welcome-link-button link-with-icon' onClick={() => this.signInWithBrowser()}>
              Sign in using your browser
              <Octicon symbol={OcticonSymbol.linkExternal} />
            </LinkButton>
          </p>
        </form>
      </div>
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

  private async signInWithBrowser() {
    await this.props.dispatcher.requestOAuth()

    this.advance()
  }

  private cancel() {
    this.props.advance(WelcomeStep.Start)
  }

  private advance() {
    this.props.advance(WelcomeStep.ConfigureGit)
  }

  private signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    // TODO: Actually sign in lolololol
  }
}
