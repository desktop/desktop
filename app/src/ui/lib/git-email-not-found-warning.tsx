import * as React from 'react'
import { Account } from '../../models/account'
import { LinkButton } from './link-button'
import { getDotComAPIEndpoint } from '../../lib/api'

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
export class GitEmailNotFoundWarning extends React.Component<
  IGitEmailNotFoundWarningProps
> {
  private get accountEmails(): ReadonlyArray<string> {
    // Merge email addresses from all accounts into an array
    return this.props.accounts.reduce<ReadonlyArray<string>>(
      (previousValue, currentValue) => {
        return previousValue.concat(currentValue.emails.map(e => e.email))
      },
      []
    )
  }

  public render() {
    if (this.accountEmails.includes(this.props.email)) {
      return null
    }

    return this.props.accounts.length === 1
      ? this.renderForSingleAccount(this.props.accounts[0])
      : this.renderForMultipleAccounts()
  }

  private renderForSingleAccount(account: Account) {
    const accountType =
      account.endpoint === getDotComAPIEndpoint()
        ? 'GitHub'
        : 'GitHub Enterprise'

    return (
      <div>
        ⚠️ This email address doesn't match your {accountType} account, so your
        commits will be wrongly attributed.{' '}
        <LinkButton uri="https://docs.github.com/en/github/committing-changes-to-your-project/why-are-my-commits-linked-to-the-wrong-user">
          Learn more.
        </LinkButton>
      </div>
    )
  }

  private renderForMultipleAccounts() {
    return (
      <div>
        ⚠️ This email address doesn't match either of your GitHub.com nor GitHub
        Enterprise accounts, so your commits will be wrongly attributed.{' '}
        <LinkButton uri="https://docs.github.com/en/github/committing-changes-to-your-project/why-are-my-commits-linked-to-the-wrong-user">
          Learn more.
        </LinkButton>
      </div>
    )
  }
}
