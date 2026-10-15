import * as React from 'react'
import { PopoverDropdown } from './lib/popover-dropdown'
import { Account, accountEquals, isDotComAccount } from '../models/account'
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
import { caseInsensitiveCompare } from '../lib/compare'

interface IAccountPickerProps {
  readonly accounts: ReadonlyArray<Account>

  /**
   * The selected account, or null when the user still has to choose one, in
   * which case the picker shows a placeholder.
   */
  readonly selectedAccount: Account | null
  readonly onSelectedAccountChanged: (account: Account) => void

  /**
   * Whether to list accounts under a heading per host, GitHub.com first and
   * then each GitHub Enterprise host alphabetically.
   */
  readonly groupByHost?: boolean

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

interface IAccountListItem extends IFilterListItem {
  readonly id: string
  readonly text: ReadonlyArray<string>
  readonly account: Account
}

const getItemId = (account: Account) => `${account.login}@${account.endpoint}`

const toListItem = (account: Account): IAccountListItem => ({
  text: [account.login, account.endpoint],
  id: getItemId(account),
  account,
})

/**
 * Group accounts by host: GitHub.com first, then GitHub Enterprise hosts
 * sorted by hostname. Accounts keep their relative order within a host.
 */
export function groupAccountsByHost(
  accounts: ReadonlyArray<Account>
): ReadonlyArray<IFilterListGroup<IAccountListItem>> {
  const groups = new Map<string, Array<IAccountListItem>>()
  for (const account of accounts) {
    const host = account.friendlyEndpoint
    const items = groups.get(host) ?? []
    items.push(toListItem(account))
    groups.set(host, items)
  }

  const isDotComHost = (items: ReadonlyArray<IAccountListItem>) =>
    items.some(i => isDotComAccount(i.account))

  return [...groups.entries()]
    .sort(([hostA, itemsA], [hostB, itemsB]) =>
      isDotComHost(itemsA) !== isDotComHost(itemsB)
        ? isDotComHost(itemsA)
          ? -1
          : 1
        : caseInsensitiveCompare(hostA, hostB)
    )
    .map(([identifier, items]) => ({ identifier, items }))
}

/**
 * A select-like element for filter and selecting an account.
 */
export class AccountPicker extends React.Component<
  IAccountPickerProps,
  IAccountPickerState
> {
  private getFilterListGroups = memoizeOne(
    (
      accounts: ReadonlyArray<Account>,
      groupByHost: boolean
    ): ReadonlyArray<IFilterListGroup<IAccountListItem>> =>
      groupByHost
        ? groupAccountsByHost(accounts)
        : [{ identifier: 'accounts', items: accounts.map(toListItem) }]
  )

  private getSelectedItem = memoizeOne(
    (
      accounts: ReadonlyArray<Account>,
      groupByHost: boolean,
      selectedItemId: string | undefined,
      selectedAccount: Account | null
    ) =>
      this.getFilterListGroups(accounts, groupByHost)
        .flatMap(x => x.items)
        .find(x =>
          // Prioritize selectedItemId (i.e. our own internal state) which
          // gets reset when the selectedAccount props changes.
          selectedItemId
            ? x.id === selectedItemId
            : selectedAccount !== null &&
              accountEquals(x.account, selectedAccount)
        ) ?? null
  )

  private popoverRef = React.createRef<PopoverDropdown>()

  public constructor(props: IAccountPickerProps) {
    super(props)

    this.state = {
      filterText: '',
      selectedItemId: undefined,
    }
  }

  public componentDidUpdate(prevProps: IAccountPickerProps) {
    if (prevProps.selectedAccount !== this.props.selectedAccount) {
      this.setState({ selectedItemId: undefined })
    }
  }

  private onFilterTextChanged = (text: string) => {
    this.setState({ filterText: text })
  }

  private getAvatarUser = (account: Account): IAvatarUser => {
    return {
      name: account.name,
      email: lookupPreferredEmail(account),
      avatarURL: account.avatarURL,
      endpoint: account.endpoint,
    }
  }

  private renderAccount = (item: IAccountListItem, matches: IMatches) => {
    const account = item.account

    return (
      <div className="account-list-item">
        <Avatar
          accounts={this.props.accounts}
          user={this.getAvatarUser(account)}
        />
        <div className="info">
          <div className="title">@{item.account.login}</div>
          <div className="subtitle">{item.account.friendlyEndpoint}</div>
        </div>
      </div>
    )
  }

  private onItemClick = (item: IAccountListItem, source: SelectionSource) => {
    const account = item.account
    this.popoverRef.current?.closePopover()

    this.setState({ selectedItemId: item.id })
    this.props.onSelectedAccountChanged(account)
  }

  private onSelectionChanged = (selectedItem: IAccountListItem | null) =>
    this.setState({ selectedItemId: selectedItem?.id })

  private getItemAriaLabel = (item: IAccountListItem) =>
    `@${item.account.login} ${item.account.friendlyEndpoint}`

  private renderGroupHeader = (identifier: string) => (
    <div className="filter-list-group-header">{identifier}</div>
  )

  private getRowHeight = (info: { readonly item: IAccountListItem | null }) =>
    info.item === null ? 29 : 47

  private renderButtonContent() {
    const account = this.props.selectedAccount
    if (account === null) {
      return (
        <div className="account placeholder">
          {__DARWIN__ ? 'Choose an Account…' : 'Choose an account…'}
        </div>
      )
    }

    return (
      <div className="account">
        <span className="login">@{account.login}</span> -{' '}
        <span className="endpoint">{account.friendlyEndpoint}</span>
      </div>
    )
  }

  public render() {
    const groupByHost = this.props.groupByHost === true

    return (
      <PopoverDropdown
        className="account-picker"
        contentTitle="Choose an account"
        buttonContent={this.renderButtonContent()}
        label="Account"
        ref={this.popoverRef}
        openButtonClassName={this.props.openButtonClassName}
      >
        <SectionFilterList<IAccountListItem>
          className="account-list"
          rowHeight={groupByHost ? this.getRowHeight : 47}
          groups={this.getFilterListGroups(this.props.accounts, groupByHost)}
          renderGroupHeader={groupByHost ? this.renderGroupHeader : undefined}
          selectedItem={this.getSelectedItem(
            this.props.accounts,
            groupByHost,
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
