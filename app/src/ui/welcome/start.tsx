import * as React from 'react'
import { WelcomeStep } from './welcome'
import { LinkButton } from '../lib/link-button'
import { Dispatcher } from '../dispatcher'
import { Octicon, OcticonSymbol } from '../octicons'
import { Button } from '../lib/button'

/**
 * The URL to the sign-up page on GitHub.com. Used in conjunction
 * with account actions in the app where the user might want to
 * consider signing up.
 */
export const CreateAccountURL = 'https://github.com/join?source=github-desktop'

interface IStartProps {
  readonly advance: (step: WelcomeStep) => void
  readonly dispatcher: Dispatcher
}

/** The first step of the Welcome flow. */
export class Start extends React.Component<IStartProps, {}> {
  public render() {
    return (
      <div id="start">
        <h1 className="welcome-title">Welcome to GitHub&nbsp;Desktop</h1>
        <p className="welcome-text">
          GitHub Desktop is a seamless way to contribute to projects on GitHub
          and GitHub Enterprise Server. Sign in below to get started with your
          existing projects.
        </p>

        <p className="welcome-text">
          New to GitHub?{' '}
          <LinkButton uri={CreateAccountURL} className="create-account-link">
            Create your free account.
          </LinkButton>
        </p>

        <div className="welcome-main-buttons">
          <Button
            type="submit"
            className="button-with-icon"
            onClick={this.signInWithBrowser}
          >
            Sign in to GitHub.com
            <Octicon symbol={OcticonSymbol.linkExternal} />
          </Button>
          <Button onClick={this.signInToEnterprise}>
            Sign in to GitHub Enterprise Server
          </Button>
        </div>

        <div>
          <LinkButton onClick={this.signInToDotCom} className="basic-auth-link">
            Sign in to GitHub.com using your username and password
          </LinkButton>
        </div>

        <div className="skip-action-container">
          <LinkButton className="skip-button" onClick={this.skip}>
            Skip this step
          </LinkButton>
        </div>
      </div>
    )
  }

  private signInWithBrowser = (event?: React.MouseEvent<HTMLButtonElement>) => {
    if (event) {
      event.preventDefault()
    }

    this.props.advance(WelcomeStep.SignInToDotComWithBrowser)
    this.props.dispatcher.requestBrowserAuthenticationToDotcom()
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
