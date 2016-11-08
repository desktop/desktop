import * as React from 'react'
import { WelcomeStep } from './welcome'
import { LinkButton } from '../lib/link-button'

const CreateAccountURL = 'https://github.com/join?source=github-desktop'

const WelcomeImageUri = `file:///${__dirname}/static/space.png`
const WelcomeImageDimensions = { width: 552, height: 307 }

interface IStartProps {
  readonly advance: (step: WelcomeStep) => void
}

/** The first step of the Welcome flow. */
export class Start extends React.Component<IStartProps, void> {
  public render() {
    return (
      <div id='start'>
        <img src={WelcomeImageUri} style={WelcomeImageDimensions}/>

        <h1>Welcome to GitHub Desktop</h1>
        <div>Get started by signing into GitHub.com or your GitHub Enterprise server.</div>
        <div className='actions'>
          <button onClick={() => this.signInToDotCom()}>GitHub.com</button>
          <button onClick={() => this.signInToEnterprise()}>GitHub Enterprise</button>
        </div>

        <div>
          <LinkButton uri={CreateAccountURL}>Create an account</LinkButton>
          {' or '}
          <LinkButton onClick={() => this.skip()}>skip this step</LinkButton>
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

  private skip() {
    this.props.advance(WelcomeStep.ConfigureGit)
  }
}
