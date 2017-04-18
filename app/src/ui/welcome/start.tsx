import * as React from 'react'
import { WelcomeStep } from './welcome'
import { LinkButton } from '../lib/link-button'
import { Button } from '../lib/button'

const CreateAccountURL = 'https://github.com/join?source=github-desktop'

interface IStartProps {
  readonly advance: (step: WelcomeStep) => void
}

/** The first step of the Welcome flow. */
export class Start extends React.Component<IStartProps, void> {
  public render() {
    return (
      <div id='start'>
        <h1 className='welcome-title'>Welcome to GitHub Desktop</h1>
        <p className='welcome-text'>
          GitHub Desktop is a seamless way to contribute to projects on GitHub
          and GitHub Enterprise. Sign in below to get started with your existing
          projects.
        </p>

        <div>
          <Button type='submit' className='welcome-button' onClick={this.signInToDotCom}>GitHub.com</Button>
          <Button type='submit' className='welcome-button' onClick={this.signInToEnterprise}>GitHub Enterprise</Button>
        </div>

        <div>
          <LinkButton uri={CreateAccountURL}>Create an account</LinkButton>
          {' or '}
          <LinkButton onClick={this.skip}>skip this step</LinkButton>
        </div>
      </div>
    )
  }

  private signInToDotCom = () => {
    this.props.advance(WelcomeStep.SignInToDotCom)
  }

  private signInToEnterprise = () => {
    this.props.advance(WelcomeStep.SignInToEnterprise)
  }

  private skip = () => {
    this.props.advance(WelcomeStep.ConfigureGit)
  }
}
