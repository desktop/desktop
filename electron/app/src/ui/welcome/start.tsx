import * as React from 'react'
import { WelcomeStep } from './welcome'
import { LinkButton } from '../lib/link-button'
import { Dispatcher } from '../dispatcher'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
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
      <section
        id="start"
        aria-label="Welcome to GitHub Desktop"
        aria-describedby="start-description"
      >
        <div className="start-content">
          <h1 className="welcome-title">
            Welcome to <span>GitHub Desktop</span>
          </h1>
          {!this.props.loadingBrowserAuth ? (
            <>
              <p id="start-description" className="welcome-text">
                GitHub Desktop is a seamless way to contribute to projects on
                GitHub and GitHub Enterprise. Sign in below to get started with
                your existing projects.
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
              autoFocus={true}
              role="link"
            >
              {this.props.loadingBrowserAuth && <Loading />}
              Sign in to GitHub.com
              <Octicon symbol={octicons.linkExternal} />
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
            <p className="welcome-text">
              New to GitHub?{' '}
              <LinkButton
                uri={CreateAccountURL}
                className="create-account-link"
              >
                Create your free account.
              </LinkButton>
            </p>
            <LinkButton className="skip-button" onClick={this.skip}>
              Skip this step
            </LinkButton>
          </div>
        </div>

        <div className="start-footer">
          <p>
            By creating an account, you agree to the{' '}
            <LinkButton uri={'https://github.com/site/terms'}>
              Terms of Service
            </LinkButton>
            . For more information about GitHub's privacy practices, see the{' '}
            <LinkButton uri={'https://github.com/site/privacy'}>
              GitHub Privacy Statement.
            </LinkButton>
          </p>
          <p>
            GitHub Desktop sends usage metrics to improve the product and inform
            feature decisions.{' '}
            <LinkButton uri={SamplesURL}>
              Learn more about user metrics.
            </LinkButton>
          </p>
        </div>
      </section>
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
