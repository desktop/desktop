import * as React from 'react'
import { Account } from '../../models/account'
import { LinkButton } from './link-button'
import { getDotComAPIEndpoint } from '../../lib/api'
import { isAttributableEmailFor } from '../../lib/email'
import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { debounce } from 'lodash'

interface IGitEmailNotFoundWarningProps {
  /** The account the commit should be attributed to. */
  readonly accounts: ReadonlyArray<Account>

  /** The email address used in the commit author info. */
  readonly email: string
}

interface IGitEmailNotFoundWarningState {
  /** The email address sent in via props, but state is debounced. */
  readonly debouncedEmail: string
}

/**
 * A component which just displays a warning to the user if their git config
 * email doesn't match any of the emails in their GitHub (Enterprise) account.
 */
export class GitEmailNotFoundWarning extends React.Component<
  IGitEmailNotFoundWarningProps,
  IGitEmailNotFoundWarningState
> {
  private onEmailChanged = debounce((email: string) => {
    this.setState({ debouncedEmail: email })
  }, 1500)

  public constructor(props: IGitEmailNotFoundWarningProps) {
    super(props)

    this.state = {
      debouncedEmail: props.email,
    }
  }

  public componentDidUpdate(prevProps: IGitEmailNotFoundWarningProps) {
    if (prevProps.email !== this.props.email) {
      this.onEmailChanged(this.props.email)
    }
  }

  public componentWillUnmount() {
    this.onEmailChanged.cancel()
  }

  public render() {
    const { accounts } = this.props
    const { debouncedEmail } = this.state

    if (accounts.length === 0 || debouncedEmail.trim().length === 0) {
      return null
    }

    const isAttributableEmail = accounts.some(account =>
      isAttributableEmailFor(account, debouncedEmail)
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
        <LinkButton uri="https://docs.github.com/en/github/committing-changes-to-your-project/why-are-my-commits-linked-to-the-wrong-user">
          Learn more.
        </LinkButton>
      </>
    ) : null

    return (
      <div
        id="git-email-not-found-warning"
        aria-live="polite"
        aria-atomic="true"
      >
        {indicatorIcon}
        <span>
          This email address {verb} {this.getAccountTypeDescription()}.
        </span>{' '}
        {info}
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
