import * as React from 'react'

import { Branch } from '../../models/branch'

import { assertNever } from '../../lib/fatal-error'

import {
  FilterList,
  IFilterListGroup,
  SelectionSource,
} from '../lib/filter-list'
import { IMatches } from '../../lib/fuzzy-find'
import { Button } from '../lib/button'
import { TextBox } from '../lib/text-box'

import {
  groupBranches,
  IBranchListItem,
  BranchGroupIdentifier,
} from './group-branches'
import { NoBranches } from './no-branches'
import { SelectionDirection, ClickSource } from '../lib/list'
import memoizeOne from 'memoize-one'

const RowHeight = 30

interface IBranchListProps {
  /**
   * See IBranchesState.defaultBranch
   */
  readonly defaultBranch: Branch | null

  /**
   * The currently checked out branch or null if HEAD is detached
   */
  readonly currentBranch: Branch | null

  /**
   * See IBranchesState.allBranches
   */
  readonly allBranches: ReadonlyArray<Branch>

  /**
   * See IBranchesState.recentBranches
   */
  readonly recentBranches: ReadonlyArray<Branch>

  /**
   * The currently selected branch in the list, see the onSelectionChanged prop.
   */
  readonly selectedBranch: Branch | null

  /**
   * Called when a key down happens in the filter field. Users have a chance to
   * respond or cancel the default behavior by calling `preventDefault`.
   */
  readonly onFilterKeyDown?: (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => void

  /** Called when an item is clicked. */
  readonly onItemClick?: (item: Branch, source: ClickSource) => void

  /**
   * This function will be called when the selection changes as a result of a
   * user keyboard or mouse action (i.e. not when props change). This function
   * will not be invoked when an already selected row is clicked on.
   *
   * @param selectedItem - The Branch that was just selected
   * @param source       - The kind of user action that provoked the change,
   *                       either a pointer device press, or a keyboard event
   *                       (arrow up/down)
   */
  readonly onSelectionChanged?: (
    selectedItem: Branch | null,
    source: SelectionSource
  ) => void

  /** The current filter text to render */
  readonly filterText: string

  /** Callback to fire when the filter text is changed */
  readonly onFilterTextChanged: (filterText: string) => void

  /** Can users create a new branch? */
  readonly canCreateNewBranch: boolean

  /**
   * Called when the user wants to create a new branch. It will be given a name
   * to prepopulate the new branch name field.
   */
  readonly onCreateNewBranch?: (name: string) => void

  readonly textbox?: TextBox

  /**
   * Render function to apply to each branch in the list
   */
  readonly renderBranch: (
    item: IBranchListItem,
    matches: IMatches
  ) => JSX.Element

  /**
   * Callback to fire when the items in the filter list are updated
   */
  readonly onFilterListResultsChanged?: (resultCount: number) => void

  /** If true, we do not render the filter. */
  readonly hideFilterRow?: boolean

  /** Called to render content before/above the branches filter and list. */
  readonly renderPreList?: () => JSX.Element | null

  /** Optional: No branches message */
  readonly noBranchesMessage?: string | JSX.Element
}

/** The Branches list component. */
export class BranchList extends React.Component<IBranchListProps> {
  private branchFilterListRef = React.createRef<FilterList<IBranchListItem>>()

  private memoizedGroupBranches = memoizeOne(groupBranches)

  private get groups() {
    return this.memoizedGroupBranches(
      this.props.defaultBranch,
      this.props.allBranches,
      this.props.recentBranches
    )
  }

  private memoizedGetSelectedItem = memoizeOne(
    (
      selectedBranch: Branch | null,
      groups: ReadonlyArray<IFilterListGroup<IBranchListItem>>
    ) => {
      let hit = undefined

      if (selectedBranch !== null) {
        for (let i = 0; i < groups.length && hit === undefined; i++) {
          hit = groups[i].items.find(x => x.branch.name === selectedBranch.name)
        }
      }

      return hit ?? null
    }
  )

  private get selectedItem() {
    return this.memoizedGetSelectedItem(this.props.selectedBranch, this.groups)
  }

  public selectNextItem(focus: boolean = false, direction: SelectionDirection) {
    this.branchFilterListRef.current?.selectNextItem(focus, direction)
  }

  public render() {
    return (
      <FilterList<IBranchListItem>
        ref={this.branchFilterListRef}
        className="branches-list"
        rowHeight={RowHeight}
        filterText={this.props.filterText}
        onFilterTextChanged={this.props.onFilterTextChanged}
        onFilterKeyDown={this.props.onFilterKeyDown}
        selectedItem={this.selectedItem}
        renderItem={this.props.renderBranch}
        renderGroupHeader={this.renderGroupHeader}
        onItemClick={this.onItemClick}
        onSelectionChanged={this.onSelectionChanged}
        onEnterPressedWithoutFilteredItems={this.onCreateNewBranch}
        groups={this.groups}
        invalidationProps={{
          branches: this.props.allBranches,
          currentBranch: this.props.currentBranch,
        }}
        renderPostFilter={this.onRenderNewButton}
        renderNoItems={this.onRenderNoItems}
        filterTextBox={this.props.textbox}
        hideFilterRow={this.props.hideFilterRow}
        onFilterListResultsChanged={this.props.onFilterListResultsChanged}
        renderPreList={this.props.renderPreList}
      />
    )
  }

  private parseHeader(label: string): BranchGroupIdentifier | null {
    switch (label) {
      case 'default':
      case 'recent':
      case 'other':
        return label
      default:
        return null
    }
  }

  private renderGroupHeader = (label: string) => {
    const identifier = this.parseHeader(label)

    return identifier !== null ? (
      <div className="branches-list-content filter-list-group-header">
        {this.getGroupLabel(identifier)}
      </div>
    ) : null
  }

  private getGroupLabel(identifier: BranchGroupIdentifier) {
    if (identifier === 'default') {
      return __DARWIN__ ? 'Default Branch' : 'Default branch'
    } else if (identifier === 'recent') {
      return __DARWIN__ ? 'Recent Branches' : 'Recent branches'
    } else if (identifier === 'other') {
      return __DARWIN__ ? 'Other Branches' : 'Other branches'
    } else {
      return assertNever(identifier, `Unknown identifier: ${identifier}`)
    }
  }

  private onRenderNoItems = () => {
    return (
      <NoBranches
        onCreateNewBranch={this.onCreateNewBranch}
        canCreateNewBranch={this.props.canCreateNewBranch}
        noBranchesMessage={this.props.noBranchesMessage}
      />
    )
  }

  private onRenderNewButton = () => {
    return this.props.canCreateNewBranch ? (
      <Button className="new-branch-button" onClick={this.onCreateNewBranch}>
        {__DARWIN__ ? 'New Branch' : 'New branch'}
      </Button>
    ) : null
  }

  private onItemClick = (item: IBranchListItem, source: ClickSource) => {
    this.props.onItemClick?.(item.branch, source)
  }

  private onSelectionChanged = (
    selectedItem: IBranchListItem | null,
    source: SelectionSource
  ) => {
    this.props.onSelectionChanged?.(selectedItem?.branch ?? null, source)
  }

  private onCreateNewBranch = () => {
    this.props.onCreateNewBranch?.(this.props.filterText)
  }
}
