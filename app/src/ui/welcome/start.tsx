import * as React from 'react'
import { shell } from 'electron'
import { WelcomeStep } from './welcome'
import { Dispatcher } from '../../lib/dispatcher'

const CreateAccountURL = 'https://github.com/join?source=github-desktop'

const WelcomeImagePath = 'static/space.png'
const WelcomeImageDimensions = { width: 552, height: 307 }

interface IStartProps {
  readonly dispatcher: Dispatcher
  readonly advance: (step: WelcomeStep) => void
  readonly cancel: () => void
}

/** The first step of the Welcome flow. */
export class Start extends React.Component<IStartProps, void> {
  public render() {
    const spacePath = `file:///${__dirname}/${WelcomeImagePath}`
    return (
      <div id='start'>
        <img src={spacePath} style={WelcomeImageDimensions}/>

        <h1>Welcome to GitHub Desktop</h1>
        <div>Get started by signing into GitHub.com or your GitHub Enterprise server.</div>
        <div className='actions'>
          <button onClick={() => this.signInToDotCom()}>GitHub.com</button>
          <button onClick={() => this.signInToEnterprise()}>GitHub Enterprise</button>
        </div>

        <div>
          <a href='' onClick={e => this.createAccount(e)}>Create an account</a>
          &nbsp;or&nbsp;
          <a href='' onClick={e => this.skip(e)}>skip this step</a>
        </div>
      </div>
    )
  }

  private signInToDotCom() {
    this.props.advance(WelcomeStep.SignInToDotCom)
  }

  private signInToEnterprise() {
    this.props.advance(WelcomeStep.SignInToEnterprise)
  }

  private createAccount(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()

    shell.openExternal(CreateAccountURL)
  }

  private skip(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()

    this.props.advance(WelcomeStep.ConfigureGit)
  }
}
