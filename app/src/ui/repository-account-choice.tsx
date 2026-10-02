import * as React from 'react'
import { Account } from '../models/account'
import { AccountPicker } from './account-picker'
import { Dialog, DialogContent, DialogError, DialogFooter } from './dialog'
import { OkCancelButtonGroup } from './dialog/ok-cancel-button-group'

interface IRepositoryAccountChoiceProps {
  readonly repositoryName: string
  readonly accounts: ReadonlyArray<Account>
  readonly onSelected: (account: Account) => Promise<void> | void
  readonly onDismissed: () => void
}

interface IRepositoryAccountChoiceState {
  readonly selectedAccount: Account | null
  readonly submitting: boolean
  readonly error: Error | null
}

/** Prompt for a repository account without selecting one implicitly. */
export class RepositoryAccountChoice extends React.Component<
  IRepositoryAccountChoiceProps,
  IRepositoryAccountChoiceState
> {
  public constructor(props: IRepositoryAccountChoiceProps) {
    super(props)
    this.state = { selectedAccount: null, submitting: false, error: null }
  }

  private onSelectedAccountChanged = (selectedAccount: Account) => {
    this.setState({ selectedAccount, error: null })
  }

  private onSubmit = async () => {
    const { selectedAccount } = this.state
    if (selectedAccount === null) {
      return
    }

    this.setState({ submitting: true })
    try {
      await this.props.onSelected(selectedAccount)
      this.props.onDismissed()
    } catch (error) {
      this.setState({ error, submitting: false })
    }
  }

  public render() {
    const { selectedAccount, submitting, error } = this.state
    return (
      <Dialog
        id="repository-account-choice"
        title="Choose a repository account"
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
        disabled={submitting}
        loading={submitting}
      >
        {error !== null ? <DialogError>{error.message}</DialogError> : null}
        <DialogContent>
          <p>Choose an account for {this.props.repositoryName}.</p>
          <AccountPicker
            accounts={this.props.accounts}
            selectedAccount={selectedAccount}
            onSelectedAccountChanged={this.onSelectedAccountChanged}
            openButtonClassName="dialog-preferred-focus"
          />
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText="Associate account"
            okButtonDisabled={selectedAccount === null}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
