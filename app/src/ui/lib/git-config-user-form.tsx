import * as React from 'react'
import { TextBox } from './text-box'
import { Row } from './row'
import { Account } from '../../models/account'
import { Select } from './select'
import { GitEmailNotFoundWarning } from './git-email-not-found-warning'

const OtherEmailSelectValue = 'Other'

interface IGitConfigUserFormProps {
  readonly name: string
  readonly email: string

  readonly dotComAccount: Account | null
  readonly enterpriseAccount: Account | null

  readonly disabled?: boolean

  readonly onNameChanged: (name: string) => void
  readonly onEmailChanged: (email: string) => void
}

interface IGitConfigUserFormState {
  /**
   * True if the selected email in the dropdown is not one of the suggestions.
   * It's used to display the "Other" text box that allows the user to
   * enter a custom email address.
   */
  readonly emailIsOther: boolean
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

  public constructor(props: IGitConfigUserFormProps) {
    super(props)

    this.state = {
      emailIsOther: !this.accountEmails.includes(this.props.email),
    }
  }

  public componentDidUpdate(
    prevProps: IGitConfigUserFormProps,
    prevState: IGitConfigUserFormState
  ) {
    // If the email coming from the props has changed, it means a new config
    // was loaded into the form. In that case, make sure to only select the
    // option "Other" if strictly needed.
    if (prevProps.email !== this.props.email) {
      this.setState({
        emailIsOther: !this.accountEmails.includes(this.props.email),
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
        <GitEmailNotFoundWarning
          accounts={this.accounts}
          email={this.props.email}
        />
      </div>
    )
  }

  private renderEmailDropdown() {
    if (this.accountEmails.length === 0) {
      return null
    }

    const dotComEmails =
      this.props.dotComAccount?.emails.map(e => e.email) ?? []
    const enterpriseEmails =
      this.props.enterpriseAccount?.emails.map(e => e.email) ?? []

    // When the user signed in both accounts, show a suffix to differentiate
    // the origin of each email address
    const shouldShowAccountType =
      this.props.dotComAccount !== null && this.props.enterpriseAccount !== null

    const dotComSuffix = shouldShowAccountType ? '(GitHub.com)' : ''
    const enterpriseSuffix = shouldShowAccountType ? '(GitHub Enterprise)' : ''

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
          {dotComEmails.map(e => (
            <option key={e} value={e}>
              {e} {dotComSuffix}
            </option>
          ))}
          {enterpriseEmails.map(e => (
            <option key={e} value={e}>
              {e} {enterpriseSuffix}
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

    return (
      <Row>
        <TextBox
          ref={this.emailInputRef}
          label={label}
          type="email"
          value={this.props.email}
          disabled={this.props.disabled}
          onValueChanged={this.props.onEmailChanged}
        />
      </Row>
    )
  }

  private get accounts(): ReadonlyArray<Account> {
    const accounts = []

    if (this.props.dotComAccount) {
      accounts.push(this.props.dotComAccount)
    }

    if (this.props.enterpriseAccount) {
      accounts.push(this.props.enterpriseAccount)
    }

    return accounts
  }

  private get accountEmails(): ReadonlyArray<string> {
    // Merge email addresses from all accounts into an array
    return this.accounts.reduce<ReadonlyArray<string>>(
      (previousValue, currentValue) => {
        return previousValue.concat(currentValue.emails.map(e => e.email))
      },
      []
    )
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
