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
}

interface IBranchListState {
  /**
   * The grouped list of branches.
   *
   * Groups are currently defined as 'default branch', 'current branch',
   * 'recent branches' and all branches.
   */
  readonly groups: ReadonlyArray<IFilterListGroup<IBranchListItem>>

  /** The selected item in the filtered list */
  readonly selectedItem: IBranchListItem | null
}

function createState(props: IBranchListProps): IBranchListState {
  const groups = groupBranches(
    props.defaultBranch,
    props.currentBranch,
    props.allBranches,
    props.recentBranches
  )

  let selectedItem: IBranchListItem | null = null
  const selectedBranch = props.selectedBranch
  if (selectedBranch) {
    for (const group of groups) {
      selectedItem =
        group.items.find(i => {
          const branch = i.branch
          return branch.name === selectedBranch.name
        }) || null

      if (selectedItem) {
        break
      }
    }
  }

  return { groups, selectedItem }
}

/** The Branches list component. */
export class BranchList extends React.Component<
  IBranchListProps,
  IBranchListState
> {
  private branchFilterList: FilterList<IBranchListItem> | null = null

  public constructor(props: IBranchListProps) {
    super(props)
    this.state = createState(props)
  }

  public componentWillReceiveProps(nextProps: IBranchListProps) {
    this.setState(createState(nextProps))
  }

  public selectNextItem(focus: boolean = false, direction: SelectionDirection) {
    if (this.branchFilterList !== null) {
      this.branchFilterList.selectNextItem(focus, direction)
    }
  }

  public render() {
    return (
      <FilterList<IBranchListItem>
        ref={this.onBranchesFilterListRef}
        className="branches-list"
        rowHeight={RowHeight}
        filterText={this.props.filterText}
        onFilterTextChanged={this.props.onFilterTextChanged}
        onFilterKeyDown={this.props.onFilterKeyDown}
        selectedItem={this.state.selectedItem}
        renderItem={this.renderItem}
        renderGroupHeader={this.renderGroupHeader}
        onItemClick={this.onItemClick}
        onSelectionChanged={this.onSelectionChanged}
        groups={this.state.groups}
        invalidationProps={this.props.allBranches}
        renderPostFilter={this.onRenderNewButton}
        renderNoItems={this.onRenderNoItems}
        filterTextBox={this.props.textbox}
        onFilterListResultsChanged={this.props.onFilterListResultsChanged}
      />
    )
  }

  private onBranchesFilterListRef = (
    filterList: FilterList<IBranchListItem> | null
  ) => {
    this.branchFilterList = filterList
  }

  private renderItem = (item: IBranchListItem, matches: IMatches) => {
    return this.props.renderBranch(item, matches)
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
    if (this.props.onItemClick) {
      this.props.onItemClick(item.branch, source)
    }
  }

  private onSelectionChanged = (
    selectedItem: IBranchListItem | null,
    source: SelectionSource
  ) => {
    if (this.props.onSelectionChanged) {
      this.props.onSelectionChanged(
        selectedItem ? selectedItem.branch : null,
        source
      )
    }
  }

  private onCreateNewBranch = () => {
    if (this.props.onCreateNewBranch) {
      this.props.onCreateNewBranch(this.props.filterText)
    }
  }
}
