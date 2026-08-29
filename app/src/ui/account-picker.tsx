import * as React from 'react'
import { PopoverDropdown } from './lib/popover-dropdown'
import {
  Account,
  accountEquals,
  IAccountMetadata,
  isDotComAccount,
} from '../models/account'
import { SectionFilterList } from './lib/section-filter-list'
import {
  IFilterListGroup,
  IFilterListItem,
  SelectionSource,
} from './lib/filter-list'
import { IMatches } from '../lib/fuzzy-find'
import { Avatar } from './lib/avatar'
import { lookupPreferredEmail } from '../lib/email'
import { IAvatarUser } from '../models/avatar'
import memoizeOne from 'memoize-one'
import { getHTMLURL } from '../lib/api'

interface IAccountPickerProps<TAccount extends IAccountMetadata> {
  readonly accounts: ReadonlyArray<TAccount>
  readonly activeAccounts: ReadonlyArray<Account>
  readonly selectedAccount: TAccount
  readonly onSelectedAccountChanged: (account: TAccount) => void

  /**
   * The class name to apply to the open button. This is useful for
   * applying the dialog-preferred-focus class to the button when it
   * should receive focus ahead of a dialog's default focus target
   */
  readonly openButtonClassName?: string
}

interface IAccountPickerState {
  readonly filterText: string
  readonly selectedItemId: string | undefined
}

interface IAccountListItem<TAccount extends IAccountMetadata>
  extends IFilterListItem {
  readonly id: string
  readonly text: ReadonlyArray<string>
  readonly account: TAccount
}

const getItemId = (account: IAccountMetadata) =>
  `${account.id}@${account.endpoint}`

const getFriendlyEndpoint = (account: IAccountMetadata) =>
  isDotComAccount(account)
    ? 'GitHub.com'
    : new URL(getHTMLURL(account.endpoint)).hostname

/**
 * A select-like element for filter and selecting an account.
 */
export class AccountPicker<
  TAccount extends IAccountMetadata
> extends React.Component<IAccountPickerProps<TAccount>, IAccountPickerState> {
  private getFilterListGroups = memoizeOne(
    (
      accounts: ReadonlyArray<TAccount>
    ): ReadonlyArray<IFilterListGroup<IAccountListItem<TAccount>>> => [
      {
        identifier: 'accounts',
        items: accounts.map(account => ({
          text: [account.login, account.endpoint],
          id: getItemId(account),
          account,
        })),
      },
    ]
  )

  private getSelectedItem = memoizeOne(
    (
      accounts: ReadonlyArray<TAccount>,
      selectedItemId: string | undefined,
      selectedAccount: TAccount
    ) =>
      this.getFilterListGroups(accounts)
        .flatMap(x => x.items)
        .find(x =>
          // Prioritize selectedItemId (i.e. our own internal state) which
          // gets reset when the selectedAccount props changes.
          selectedItemId
            ? x.id === selectedItemId
            : accountEquals(x.account, selectedAccount)
        ) ?? null
  )

  private popoverRef = React.createRef<PopoverDropdown>()

  public constructor(props: IAccountPickerProps<TAccount>) {
    super(props)

    this.state = {
      filterText: '',
      selectedItemId: undefined,
    }
  }

  public componentDidUpdate(prevProps: IAccountPickerProps<TAccount>) {
    if (prevProps.selectedAccount !== this.props.selectedAccount) {
      this.setState({ selectedItemId: undefined })
    }
  }

  private onFilterTextChanged = (text: string) => {
    this.setState({ filterText: text })
  }

  private getAvatarUser = (account: IAccountMetadata): IAvatarUser => {
    return {
      name: account.name,
      email: lookupPreferredEmail(account),
      avatarURL: account.avatarURL,
      endpoint: account.endpoint,
    }
  }

  private renderAccount = (
    item: IAccountListItem<TAccount>,
    matches: IMatches
  ) => {
    const account = item.account

    return (
      <div className="account-list-item">
        <Avatar
          accounts={this.props.activeAccounts}
          user={this.getAvatarUser(account)}
        />
        <div className="info">
          <div className="title">@{item.account.login}</div>
          <div className="subtitle">{getFriendlyEndpoint(item.account)}</div>
        </div>
      </div>
    )
  }

  private onItemClick = (
    item: IAccountListItem<TAccount>,
    source: SelectionSource
  ) => {
    const account = item.account
    this.popoverRef.current?.closePopover()

    this.setState({ selectedItemId: item.id })
    this.props.onSelectedAccountChanged(account)
  }

  private onSelectionChanged = (
    selectedItem: IAccountListItem<TAccount> | null
  ) => this.setState({ selectedItemId: selectedItem?.id })

  private getItemAriaLabel = (item: IAccountListItem<TAccount>) =>
    `@${item.account.login} ${getFriendlyEndpoint(item.account)}`

  public render() {
    const account = this.props.selectedAccount

    return (
      <PopoverDropdown
        className="account-picker"
        contentTitle="Choose an account"
        buttonContent={
          <div className="account">
            <span className="login">@{account.login}</span> -{' '}
            <span className="endpoint">
              {getFriendlyEndpoint(this.props.selectedAccount)}
            </span>
          </div>
        }
        label="Account"
        ref={this.popoverRef}
        openButtonClassName={this.props.openButtonClassName}
      >
        <SectionFilterList<IAccountListItem<TAccount>>
          className="account-list"
          rowHeight={47}
          groups={this.getFilterListGroups(this.props.accounts)}
          selectedItem={this.getSelectedItem(
            this.props.accounts,
            this.state.selectedItemId,
            this.props.selectedAccount
          )}
          renderItem={this.renderAccount}
          filterText={this.state.filterText}
          onFilterTextChanged={this.onFilterTextChanged}
          invalidationProps={this.props.accounts}
          onItemClick={this.onItemClick}
          onSelectionChanged={this.onSelectionChanged}
          getItemAriaLabel={this.getItemAriaLabel}
        />
      </PopoverDropdown>
    )
  }
}
