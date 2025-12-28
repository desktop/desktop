import * as React from 'react'
import { Account, isDotComAccount } from '../models/account'

interface IAccountSwitcherProps {
  readonly accounts: ReadonlyArray<Account>
  readonly activeAccount: Account | null
  readonly onSwitchAccount: (account: Account) => void
}

interface IAccountSwitcherState {
  readonly isOpen: boolean
}

/**
 * Quick account switcher for GitHub.com accounts.
 * Shows a dropdown to switch between multiple signed-in accounts.
 */
export class AccountSwitcher extends React.Component<
  IAccountSwitcherProps,
  IAccountSwitcherState
> {
  public constructor(props: IAccountSwitcherProps) {
    super(props)
    this.state = { isOpen: false }
  }

  private toggleDropdown = () => {
    this.setState({ isOpen: !this.state.isOpen })
  }

  private closeDropdown = () => {
    this.setState({ isOpen: false })
  }

  private handleAccountClick = (account: Account) => {
    this.props.onSwitchAccount(account)
    this.closeDropdown()
  }

  public render() {
    const { accounts, activeAccount } = this.props
    const dotComAccounts = accounts.filter(isDotComAccount)

    // Don't show switcher if there's less than 2 accounts
    if (dotComAccounts.length < 2) {
      return null
    }

    // Use first account if no active account is set
    const displayAccount = activeAccount || dotComAccounts[0]

    return (
      <div className="account-switcher">
        <button onClick={this.toggleDropdown} className="switcher-button">
          <span className="account-label">Account:</span>
          <span className="account-login">{displayAccount.login}</span>
          <span className="dropdown-arrow">▾</span>
        </button>

        {this.state.isOpen && (
          <div className="account-dropdown">
            {dotComAccounts.map(account => {
              const isActive =
                displayAccount && account.id === displayAccount.id
              return (
                <div
                  key={account.id}
                  className={`account-item ${isActive ? 'active' : ''}`}
                  onClick={() => this.handleAccountClick(account)}
                >
                  <div className="account-info">
                    <div className="account-name">{account.name}</div>
                    <div className="account-login">@{account.login}</div>
                  </div>
                  {isActive && <span className="active-indicator">✓</span>}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }
}
