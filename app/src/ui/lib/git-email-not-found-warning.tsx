import * as React from 'react'
import { Account } from '../../models/account'
import { LinkButton } from './link-button'
import { getDotComAPIEndpoint } from '../../lib/api'
import { isAttributableEmailFor } from '../../lib/email'
import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { AriaLiveContainer } from '../accessibility/aria-live-container'

interface IGitEmailNotFoundWarningProps {
  /** The account the commit should be attributed to. */
  readonly accounts: ReadonlyArray<Account>

  /** The email address used in the commit author info. */
  readonly email: string
}

/**
 * A component which just displays a warning to the user if their git config
 * email doesn't match any of the emails in their GitHub (Enterprise) account.
 */
export class GitEmailNotFoundWarning extends React.Component<IGitEmailNotFoundWarningProps> {
  private buildMessage() {
    const { accounts, email } = this.props

    if (accounts.length === 0 || email.trim().length === 0) {
      return null
    }

    const isAttributableEmail = accounts.some(account =>
      isAttributableEmailFor(account, email)
    )

    const verb = !isAttributableEmail ? 'does not match' : 'matches'

    const indicatorIcon = !isAttributableEmail ? (
      <span className="warning-icon">⚠️</span>
    ) : (
      <span className="green-circle">
        <Octicon className="check-icon" symbol={OcticonSymbol.check} />
      </span>
    )

    const info = !isAttributableEmail ? (
      <>
        Your commits will be wrongly attributed.{' '}
        <LinkButton
          ariaLabel="Learn more about commit attribution"
          uri="https://docs.github.com/en/github/committing-changes-to-your-project/why-are-my-commits-linked-to-the-wrong-user"
        >
          Learn more.
        </LinkButton>
      </>
    ) : null

    return (
      <>
        {indicatorIcon}
        This email address {verb} {this.getAccountTypeDescription()}. {info}
      </>
    )
  }

  public render() {
    const { accounts, email } = this.props

    if (accounts.length === 0 || email.trim().length === 0) {
      return null
    }

    /**
     * Here we put the message in the top div for visual users immediately  and
     * in the bottom div for screen readers. The screen reader content is
     * debounced to avoid frequent updates from typing in the email field.
     */
    return (
      <>
        <div className="git-email-not-found-warning">{this.buildMessage()}</div>

        <AriaLiveContainer
          id="git-email-not-found-warning-for-screen-readers"
          trackedUserInput={this.props.email}
        >
          {this.buildMessage()}
        </AriaLiveContainer>
      </>
    )
  }

  private getAccountTypeDescription() {
    if (this.props.accounts.length === 1) {
      const accountType =
        this.props.accounts[0].endpoint === getDotComAPIEndpoint()
          ? 'GitHub'
          : 'GitHub Enterprise'

      return `your ${accountType} account`
    }

    return 'either of your GitHub.com nor GitHub Enterprise accounts'
  }
}
