import * as React from 'react'
import { Account } from '../../models/account'
import { LinkButton } from './link-button'
import { getDotComAPIEndpoint } from '../../lib/api'
import { isAttributableEmailFor } from '../../lib/email'

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
  public render() {
    const { accounts, email } = this.props

    if (
      accounts.length === 0 ||
      accounts.some(account => isAttributableEmailFor(account, email))
    ) {
      return null
    }

    return (
      <div className="git-email-not-found-warning">
        <span className="warning-icon">⚠️</span> This email address doesn't
        match {this.getAccountTypeDescription()}, so your commits will be
        wrongly attributed.{' '}
        <LinkButton uri="https://docs.github.com/en/github/committing-changes-to-your-project/why-are-my-commits-linked-to-the-wrong-user">
          Learn more.
        </LinkButton>
      </div>
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
