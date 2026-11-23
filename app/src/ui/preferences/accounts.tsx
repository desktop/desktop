import * as React from 'react'
import { Account, isDotComAccount } from '../../models/account'
import { IAvatarUser } from '../../models/avatar'
import { lookupPreferredEmail } from '../../lib/email'
import { getHTMLURL } from '../../lib/api'
import { Button } from '../lib/button'
import { DialogContent, DialogPreferredFocusClassName } from '../dialog'
import { Avatar } from '../lib/avatar'
import { IMenuItem, showContextualMenu } from '../../lib/menu-item'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

interface IAccountsProps {
  readonly accounts: ReadonlyArray<Account>

  readonly onDotComSignIn: () => void
  readonly onEnterpriseSignIn: () => void
  readonly onLogout: (account: Account) => void
  readonly onManageRepositories: (account: Account) => void
}

/**
 * Get the host to show for an account: GitHub.com, or the Enterprise host
 * including any non-default port.
 */
function getAccountHost(account: Account): string {
  return isDotComAccount(account)
    ? 'GitHub.com'
    : new URL(getHTMLURL(account.endpoint)).host
}

/**
 * Sort accounts with GitHub.com first, then by host alphabetically.
 *
 * Accounts on the same host keep their relative order.
 */
export function sortAccountsForDisplay(
  accounts: ReadonlyArray<Account>
): ReadonlyArray<Account> {
  return [...accounts].sort((x, y) => {
    const xDotCom = isDotComAccount(x)
    if (xDotCom !== isDotComAccount(y)) {
      return xDotCom ? -1 : 1
    }
    return getAccountHost(x).localeCompare(getAccountHost(y))
  })
}

export class Accounts extends React.Component<IAccountsProps, {}> {
  public render() {
    const accounts = sortAccountsForDisplay(this.props.accounts)

    return (
      <DialogContent className="accounts-tab">
        <div className="accounts-header">
          <div className="accounts-header-text">
            <h2 id="accounts-heading">Accounts</h2>
            <p className="accounts-description">
              Sign in to GitHub.com or GitHub Enterprise to access your
              repositories.
            </p>
          </div>
          <Button
            className={`add-account-button ${DialogPreferredFocusClassName}`}
            onClick={this.showAddAccountMenu}
            ariaHaspopup="menu"
          >
            <Octicon symbol={octicons.plus} />
            {__DARWIN__ ? 'Add Account' : 'Add account'}
            <Octicon symbol={octicons.triangleDown} />
          </Button>
        </div>
        {accounts.length === 0 ? (
          <div className="accounts-list accounts-empty">
            You are not signed in to any accounts.
          </div>
        ) : (
          <ul className="accounts-list" aria-labelledby="accounts-heading">
            {accounts.map(this.renderAccount)}
          </ul>
        )}
      </DialogContent>
    )
  }

  private renderAccount = (account: Account) => {
    const avatarUser: IAvatarUser = {
      name: account.name,
      email: lookupPreferredEmail(account),
      avatarURL: account.avatarURL,
      endpoint: account.endpoint,
    }

    return (
      <li
        key={JSON.stringify([
          account.endpoint.toLowerCase(),
          account.login.toLowerCase(),
        ])}
        className="account-info"
      >
        <Avatar accounts={this.props.accounts} user={avatarUser} />
        <div className="user-info">
          <div className="name">{account.name}</div>
          <div className="login">
            @{account.login}
            <span className="host"> · {getAccountHost(account)}</span>
          </div>
        </div>
        <Button
          onClick={this.showAccountMenu(account)}
          ariaLabel={`Actions for @${account.login}`}
          ariaHaspopup="menu"
          tooltip={`Actions for @${account.login}`}
          applyTooltipAriaDescribedBy={false}
        >
          <Octicon symbol={octicons.kebabHorizontal} />
        </Button>
      </li>
    )
  }

  private showAddAccountMenu = () => {
    const items: ReadonlyArray<IMenuItem> = [
      {
        label: 'GitHub.com',
        action: () => this.props.onDotComSignIn(),
      },
      {
        label: 'GitHub Enterprise',
        action: () => this.props.onEnterpriseSignIn(),
      },
    ]
    showContextualMenu(items)
  }

  private showAccountMenu = (account: Account) => {
    return () => {
      const items: ReadonlyArray<IMenuItem> = [
        {
          label: __DARWIN__ ? 'Manage Repositories…' : 'Manage repositories…',
          action: () => this.props.onManageRepositories(account),
        },
        { type: 'separator' },
        {
          label: __DARWIN__ ? 'Sign Out' : 'Sign out',
          action: () => this.props.onLogout(account),
        },
      ]
      showContextualMenu(items)
    }
  }
}
