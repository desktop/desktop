import * as React from 'react'
import { WelcomeStep } from './welcome'
import { LinkButton } from '../lib/link-button'
import { Dispatcher } from '../dispatcher'
import { Octicon, OcticonSymbol } from '../octicons'
import { Button } from '../lib/button'
import { Loading } from '../lib/loading'
import { BrowserRedirectMessage } from '../lib/authentication-form'
import { SamplesURL } from '../../lib/stats'

/**
 * The URL to the sign-up page on GitHub.com. Used in conjunction
 * with account actions in the app where the user might want to
 * consider signing up.
 */
export const CreateAccountURL = 'https://github.com/join?source=github-desktop'

interface IStartProps {
  readonly advance: (step: WelcomeStep) => void
  readonly dispatcher: Dispatcher
  readonly loadingBrowserAuth: boolean
}

/** The first step of the Welcome flow. */
export class Start extends React.Component<IStartProps, {}> {
  public render() {
    return (
      <div id="start">
        <h1 className="welcome-title">Welcome to GitHub&nbsp;Desktop</h1>
        {!this.props.loadingBrowserAuth ? (
          <>
            <p className="welcome-text">
              GitHub Desktop is a seamless way to contribute to projects on
              GitHub and GitHub Enterprise. Sign in below to get started with
              your existing projects.
            </p>
            <p className="welcome-text">
              New to GitHub?{' '}
              <LinkButton
                uri={CreateAccountURL}
                className="create-account-link"
              >
                Create your free account.
              </LinkButton>
            </p>
          </>
        ) : (
          <p>{BrowserRedirectMessage}</p>
        )}

        <div className="welcome-main-buttons">
          <Button
            type="submit"
            className="button-with-icon"
            disabled={this.props.loadingBrowserAuth}
            onClick={this.signInWithBrowser}
          >
            {this.props.loadingBrowserAuth && <Loading />}
            Sign in to GitHub.com
            <Octicon symbol={OcticonSymbol.linkExternal} />
          </Button>
          {this.props.loadingBrowserAuth ? (
            <Button onClick={this.cancelBrowserAuth}>Cancel</Button>
          ) : (
            <Button onClick={this.signInToEnterprise}>
              Sign in to GitHub Enterprise
            </Button>
          )}
        </div>
        <div className="skip-action-container">
          <LinkButton className="skip-button" onClick={this.skip}>
            Skip this step
          </LinkButton>
        </div>
        <div className="welcome-start-disclaimer-container">
          By creating an account, you agree to the{' '}
          <LinkButton uri={'https://github.com/site/terms'}>
            Terms of Service
          </LinkButton>
          . For more information about GitHub's privacy practices, see the{' '}
          <LinkButton uri={'https://github.com/site/privacy'}>
            GitHub Privacy Statement
          </LinkButton>
          .<br />
          <br />
          GitHub Desktop sends usage metrics to improve the product and inform
          feature decisions. Read more about what metrics are sent and how we
          use them <LinkButton uri={SamplesURL}>here</LinkButton>.
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

  private cancelBrowserAuth = () => {
    this.props.advance(WelcomeStep.Start)
  }

  private signInToEnterprise = () => {
    this.props.advance(WelcomeStep.SignInToEnterprise)
  }

  private skip = () => {
    this.props.advance(WelcomeStep.ConfigureGit)
  }
}
