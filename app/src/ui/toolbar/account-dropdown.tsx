import * as React from 'react'
import { Account, isDotComAccount } from '../../models/account'
import { ToolbarDropdown, DropdownState } from './dropdown'
import * as octicons from '../octicons/octicons.generated'

interface IAccountDropdownProps {
  readonly accounts: ReadonlyArray<Account>
  readonly activeAccountId: number | null
  readonly isOpen: boolean
  readonly onDropdownStateChanged: (state: DropdownState) => void
  readonly onSwitchAccount: (account: Account) => void
}

export class AccountDropdown extends React.Component<IAccountDropdownProps> {
  private renderAccountFoldout = (): JSX.Element | null => {
    const { accounts, activeAccountId, onSwitchAccount } = this.props
    const dotComAccounts = accounts.filter(isDotComAccount)

    if (dotComAccounts.length < 2) {
      return null
    }

    return (
      <div className="account-list-container">
        <div className="account-list">
          {dotComAccounts.map(account => {
            const isActive = account.id === activeAccountId
            return (
              <button
                key={account.id}
                className={`account-list-item ${isActive ? 'selected' : ''}`}
                onClick={() => onSwitchAccount(account)}
                tabIndex={0}
              >
                <div className="account-info">
                  <div className="account-name">{account.name}</div>
                  <div className="account-login">@{account.login}</div>
                </div>
                {isActive && <div className="checkmark">✓</div>}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  public render() {
    const { accounts, activeAccountId, isOpen, onDropdownStateChanged } = this.props
    const dotComAccounts = accounts.filter(isDotComAccount)

    // Don't show if less than 2 accounts
    if (dotComAccounts.length < 2) {
      return null
    }

    // Find active account or use first one
    const activeAccount = dotComAccounts.find(a => a.id === activeAccountId) || dotComAccounts[0]
    const currentState: DropdownState = isOpen ? 'open' : 'closed'

    return (
      <ToolbarDropdown
        className="account-button"
        icon={octicons.person}
        title={activeAccount.login}
        description="Account"
        tooltip={`Signed in as ${activeAccount.login}`}
        onDropdownStateChanged={onDropdownStateChanged}
        dropdownContentRenderer={this.renderAccountFoldout}
        dropdownState={currentState}
        showDisclosureArrow={true}
      />
    )
  }
}
