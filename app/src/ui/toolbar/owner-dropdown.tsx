import * as React from 'react'
import * as octicons from '../octicons/octicons.generated'
import { ToolbarDropdown, DropdownState, ToolbarDropdownStyle } from './dropdown'
import { IAPIOrganization } from '../../lib/api'
import { Account } from '../../models/account'
import { FilterList, IFilterListGroup, IFilterListItem } from '../lib/filter-list'
import { IMatches } from '../../lib/fuzzy-find'
import { ClickSource } from '../lib/list'
import { Octicon } from '../octicons'

interface IOwnerListItem extends IFilterListItem {
  readonly id: string
  readonly text: ReadonlyArray<string>
  readonly login: string
  readonly isOrg: boolean
}

interface IOwnerDropdownProps {
  /** The current account */
  readonly account: Account

  /** The list of organizations */
  readonly organizations: ReadonlyArray<IAPIOrganization>

  /** The currently selected owner (login name) */
  readonly selectedOwner: string | null

  /** Called when an owner is selected */
  readonly onOwnerSelected: (owner: string | null) => void

  /** Whether the dropdown is open */
  readonly isOpen: boolean

  /** Called when the dropdown state changes */
  readonly onDropdownStateChanged: (state: DropdownState) => void
}

interface IOwnerDropdownState {
  readonly filterText: string
}

export class OwnerDropdown extends React.Component<
  IOwnerDropdownProps,
  IOwnerDropdownState
> {
  public constructor(props: IOwnerDropdownProps) {
    super(props)
    this.state = {
      filterText: '',
    }
  }

  private onDropdownStateChanged = (
    state: DropdownState,
    source: 'keyboard' | 'pointer'
  ) => {
    this.props.onDropdownStateChanged(state)
    if (state === 'closed') {
      this.setState({ filterText: '' })
    }
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
  }

  private onItemClick = (item: IOwnerListItem, source: ClickSource) => {
    // "All Owners" has id of empty string
    const owner = item.id === '' ? null : item.login
    this.props.onOwnerSelected(owner)
    this.props.onDropdownStateChanged('closed')
    this.setState({ filterText: '' })
  }

  private buildOwnerGroups(): ReadonlyArray<IFilterListGroup<IOwnerListItem>> {
    const { account, organizations } = this.props

    const items: IOwnerListItem[] = [
      {
        id: '',
        text: ['All Owners'],
        login: '',
        isOrg: false,
      },
      {
        id: account.login,
        text: [account.login],
        login: account.login,
        isOrg: false,
      },
      ...organizations.map(org => ({
        id: org.login,
        text: [org.login],
        login: org.login,
        isOrg: true,
      })),
    ]

    return [
      {
        identifier: 'owners',
        items,
      },
    ]
  }

  private renderItem = (
    item: IOwnerListItem,
    matches: IMatches
  ): JSX.Element | null => {
    const isSelected =
      (item.id === '' && this.props.selectedOwner === null) ||
      item.login === this.props.selectedOwner

    return (
      <div className="owner-list-item">
        <span className="owner-name">{item.login || 'All Owners'}</span>
        {isSelected && (
          <span className="checkmark">
            <Octicon symbol={octicons.check} />
          </span>
        )}
      </div>
    )
  }

  private getSelectedItem(): IOwnerListItem | null {
    const groups = this.buildOwnerGroups()
    const { selectedOwner } = this.props

    for (const group of groups) {
      for (const item of group.items) {
        if (
          (selectedOwner === null && item.id === '') ||
          item.login === selectedOwner
        ) {
          return item
        }
      }
    }
    return null
  }

  private renderDropdownContent = (): JSX.Element => {
    const groups = this.buildOwnerGroups()

    return (
      <div className="owner-dropdown-content">
        <FilterList<IOwnerListItem>
          className="owner-filter-list"
          rowHeight={30}
          groups={groups}
          selectedItem={this.getSelectedItem()}
          filterText={this.state.filterText}
          onFilterTextChanged={this.onFilterTextChanged}
          onItemClick={this.onItemClick}
          renderItem={this.renderItem}
          placeholderText="Filter owners..."
          invalidationProps={this.props.organizations}
        />
      </div>
    )
  }

  public render() {
    const { selectedOwner, isOpen } = this.props
    const title = selectedOwner || 'All Owners'
    const dropdownState: DropdownState = isOpen ? 'open' : 'closed'

    return (
      <ToolbarDropdown
        className="owner-dropdown"
        icon={octicons.person}
        title={title}
        description="Owner"
        dropdownState={dropdownState}
        onDropdownStateChanged={this.onDropdownStateChanged}
        dropdownContentRenderer={this.renderDropdownContent}
        dropdownStyle={ToolbarDropdownStyle.MultiOption}
        showDisclosureArrow={true}
      />
    )
  }
}
