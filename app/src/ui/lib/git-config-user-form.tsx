import * as React from 'react'
import { TextBox } from './text-box'
import { Row } from './row'
import {
  Account,
  isDotComAccount,
  isEnterpriseAccount,
} from '../../models/account'
import { Select } from './select'
import { GitEmailNotFoundWarning } from './git-email-not-found-warning'
import { getStealthEmailForAccount } from '../../lib/email'
import memoizeOne from 'memoize-one'

const OtherEmailSelectValue = 'Other'

interface IGitConfigUserFormProps {
  readonly name: string
  readonly email: string

  /**
   * The accounts from which to source candidates for email selection
   *
   * When the GitConfigUserForm is used from the repository settings, this
   * should contain only the account associated with the current repository but
   * when used from the Preferences dialog it should contain all accounts.
   */
  readonly accounts: ReadonlyArray<Account>
  readonly disabled?: boolean

  readonly onNameChanged: (name: string) => void
  readonly onEmailChanged: (email: string) => void

  readonly isLoadingGitConfig: boolean
}

interface IGitConfigUserFormState {
  /**
   * True if the selected email in the dropdown is not one of the suggestions.
   * It's used to display the "Other" text box that allows the user to
   * enter a custom email address.
   */
  readonly emailIsOther: boolean
}

type AccountEmail = {
  readonly email: string
  readonly normalizedEmail: string
  readonly account: Account
}

/**
 * Form with a name and email address used to present and change the user's info
 * via git config.
 *
 * It'll offer the email addresses from the user's accounts (if any), and an
 * option to enter a custom email address. In this case, it will also warn the
 * user when this custom email address could result in misattributed commits.
 */
export class GitConfigUserForm extends React.Component<
  IGitConfigUserFormProps,
  IGitConfigUserFormState
> {
  private emailInputRef = React.createRef<TextBox>()

  private getAccountEmailsFromAccounts = memoizeOne(
    (accounts: ReadonlyArray<Account>) => {
      const seenEmails = new Set<string>()
      const accountEmails = new Array<AccountEmail>()

      for (const account of accounts) {
        const verifiedEmails = account.emails
          .filter(x => x.verified)
          .map(x => x.email)

        // For GitHub.com we always include the stealth email, see
        // https://github.com/desktop/desktop/pull/19968
        const emails = isDotComAccount(account)
          ? [...verifiedEmails, getStealthEmailForAccount(account)]
          : verifiedEmails

        for (const email of emails) {
          const normalizedEmail = email.toLowerCase()

          if (!seenEmails.has(normalizedEmail)) {
            seenEmails.add(normalizedEmail)
            accountEmails.push({ email, normalizedEmail, account })
          }
        }
      }

      return accountEmails
    }
  )

  public constructor(props: IGitConfigUserFormProps) {
    super(props)

    this.state = {
      emailIsOther:
        !this.isValidEmail(props.email) && !props.isLoadingGitConfig,
    }
  }

  private isValidEmail = (email: string) => {
    const normalizedEmail = email.toLowerCase()
    return this.accountEmails.some(x => x.normalizedEmail === normalizedEmail)
  }

  public componentDidUpdate(
    prevProps: IGitConfigUserFormProps,
    prevState: IGitConfigUserFormState
  ) {
    const isEmailInputFocused =
      this.emailInputRef.current !== null &&
      this.emailInputRef.current.isFocused

    // If the email coming from the props has changed, it means a new config
    // was loaded into the form. In that case, make sure to only select the
    // option "Other" if strictly needed, and select one of the account emails
    // otherwise.
    // If the "Other email" input field is currently focused, we won't hide it
    // from the user, to prevent annoying UI glitches.
    if (prevProps.email !== this.props.email && !isEmailInputFocused) {
      this.setState({
        emailIsOther:
          !this.isValidEmail(this.props.email) &&
          !this.props.isLoadingGitConfig,
      })
    }

    // Focus the text input that allows the user to enter a custom
    // email address when the user selects "Other".
    if (
      this.state.emailIsOther !== prevState.emailIsOther &&
      this.state.emailIsOther === true &&
      this.emailInputRef.current !== null
    ) {
      const emailInput = this.emailInputRef.current
      emailInput.focus()
      emailInput.selectAll()
    }
  }

  public render() {
    return (
      <div>
        <Row>
          <TextBox
            label="Name"
            value={this.props.name}
            disabled={this.props.disabled}
            onValueChanged={this.props.onNameChanged}
          />
        </Row>
        {this.renderEmailDropdown()}
        {this.renderEmailTextBox()}
        {this.state.emailIsOther ? (
          <GitEmailNotFoundWarning
            accounts={this.props.accounts}
            email={this.props.email}
          />
        ) : null}
      </div>
    )
  }

  private renderEmailDropdown() {
    if (this.accountEmails.length === 0) {
      return null
    }

    // When the user signed in both accounts, show a suffix to differentiate
    // the origin of each email address
    const shouldShowAccountType =
      this.props.accounts.some(isDotComAccount) &&
      this.props.accounts.some(isEnterpriseAccount)

    const accountSuffix = (account: Account) =>
      isDotComAccount(account) ? '(GitHub.com)' : '(GitHub Enterprise)'

    return (
      <Row>
        <Select
          label="Email"
          value={
            this.state.emailIsOther ? OtherEmailSelectValue : this.props.email
          }
          disabled={this.props.disabled}
          onChange={this.onEmailSelectChange}
        >
          {this.accountEmails.map(e => (
            <option key={e.email} value={e.email}>
              {e.email} {shouldShowAccountType && accountSuffix(e.account)}
            </option>
          ))}
          <option key={OtherEmailSelectValue} value={OtherEmailSelectValue}>
            {OtherEmailSelectValue}
          </option>
        </Select>
      </Row>
    )
  }

  private renderEmailTextBox() {
    if (this.state.emailIsOther === false && this.accountEmails.length > 0) {
      return null
    }

    // Only show the "Email" label above the textbox when the textbox is
    // presented independently, without the email dropdown, not when presented
    // as a consequence of the option "Other" selected in the dropdown.
    const label = this.state.emailIsOther ? undefined : 'Email'
    // If there is not a label, provide a screen reader announcement.
    const ariaLabel = label ? undefined : 'Email'

    return (
      <Row>
        <TextBox
          ref={this.emailInputRef}
          label={label}
          type="email"
          value={this.props.email}
          disabled={this.props.disabled}
          onValueChanged={this.props.onEmailChanged}
          ariaLabel={ariaLabel}
          ariaDescribedBy="git-email-not-found-warning-for-screen-readers"
          ariaControls="git-email-not-found-warning-for-screen-readers"
        />
      </Row>
    )
  }

  private get accountEmails(): ReadonlyArray<AccountEmail> {
    return this.getAccountEmailsFromAccounts(this.props.accounts)
  }

  private onEmailSelectChange = (event: React.FormEvent<HTMLSelectElement>) => {
    const value = event.currentTarget.value
    this.setState({
      emailIsOther: value === OtherEmailSelectValue,
    })

    // If the dropdown selection is "Other", the email address itself didn't
    // change, technically, so no need to emit an update notification.
    if (value !== OtherEmailSelectValue) {
      this.props.onEmailChanged?.(value)
    }
  }
}
