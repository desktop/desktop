import * as React from 'react'
import { lookupPreferredEmail } from '../../lib/email'
import { Account } from '../../models/account'
import { IAvatarUser } from '../../models/avatar'

import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Row } from '../lib/row'

import { Avatar } from '../lib/avatar'

import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { List } from '../lib/list'

interface IChooseAccountProps {
  readonly accounts: ReadonlyArray<Account>
  readonly selectedAccounts: ReadonlyArray<number>
  readonly onAccountSelectionChanged: (rows: ReadonlyArray<number>) => void
  readonly onRowClick: (row: number) => void
  readonly onDismissed: () => void
}

interface IChooseAccountState {}

export class ChooseAccount extends React.Component<
  IChooseAccountProps,
  IChooseAccountState
> {
  public constructor(props: IChooseAccountProps) {
    super(props)

    this.state = {}
  }

  private onContinue = () => {}

  private renderRow = (index: number) => {
    const account = this.props.accounts[index]

    const found = lookupPreferredEmail(account.emails)
    const email = found ? found.email : ''

    const avatarUser: IAvatarUser = {
      name: account.name,
      email: email,
      avatarURL: account.avatarURL,
    }

    return (
      <Row className="account-info">
        <Avatar user={avatarUser} />
        <div className="user-info">
          <div className="name">{account.name}</div>
          <div className="login">@{account.login}</div>
        </div>
      </Row>
    )
  }

  public render() {
    const disabled = this.props.selectedAccounts.length === 0
    return (
      <Dialog
        id="troubleshoot-ssh"
        title="Create SSH Key"
        onDismissed={this.props.onDismissed}
        onSubmit={this.onContinue}
      >
        <DialogContent>
          <Row>Choose an account to associate with the new SSH key:</Row>

          <Row>
            <div className="account-list-container">
              <List
                rowRenderer={this.renderRow}
                rowCount={this.props.accounts.length}
                rowHeight={34}
                selectedRows={this.props.selectedAccounts}
                selectionMode="single"
                invalidationProps={this.props.accounts}
                onSelectionChanged={this.props.onAccountSelectionChanged}
                onRowClick={this.props.onRowClick}
              />
            </div>
          </Row>
        </DialogContent>
        <DialogFooter>
          <ButtonGroup>
            <Button disabled={disabled} type="submit">
              Continue
            </Button>
            <Button onClick={this.props.onDismissed}>Cancel</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
