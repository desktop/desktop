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
    const dotComEmails =
      this.props.dotComAccount?.emails.map(e => e.email) ?? []
    const enterpriseEmails =
      this.props.enterpriseAccount?.emails.map(e => e.email) ?? []

    const shouldShowAccountType =
      this.props.dotComAccount !== null && this.props.enterpriseAccount !== null

    const dotComSuffix = shouldShowAccountType ? '(GitHub.com)' : ''
    const enterpriseSuffix = shouldShowAccountType ? '(GitHub Enterprise)' : ''

    return (
      <div>
        <Row>
          <TextBox
            label="Name"
            value={this.props.name}
            onValueChanged={this.props.onNameChanged}
          />
        </Row>
        <Row>
          <Select
            label="Email"
            value={
              this.state.emailIsOther ? OtherEmailSelectValue : this.props.email
            }
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
        {this.state.emailIsOther && (
          <Row>
            <TextBox
              ref={this.emailInputRef}
              type="email"
              value={this.props.email}
              onValueChanged={this.props.onEmailChanged}
            />
          </Row>
        )}
        <GitEmailNotFoundWarning
          accounts={this.accounts}
          email={this.props.email}
        />
      </div>
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

    if (value !== OtherEmailSelectValue) {
      this.props.onEmailChanged?.(value)
    }
  }
}
