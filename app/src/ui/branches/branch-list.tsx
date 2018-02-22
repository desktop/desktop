import * as React from 'react'
import { Branch } from '../../models/branch'
import {
  groupBranches,
  IBranchListItem,
  BranchGroupIdentifier,
} from './group-branches'
import { BranchListItem } from './branch'
import {
  FilterList,
  IFilterListGroup,
  SelectionSource,
} from '../lib/filter-list'
import { assertNever } from '../../lib/fatal-error'
import { Button } from '../lib/button'
import { NoBranches } from './no-branches'

/**
 * TS can't parse generic specialization in JSX, so we have to alias it here
 * with the generic type. See https://github.com/Microsoft/TypeScript/issues/6395.
 */
const BranchesFilterList: new () => FilterList<
  IBranchListItem
> = FilterList as any

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
  readonly onItemClick?: (item: Branch) => void

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
  public constructor(props: IBranchListProps) {
    super(props)
    this.state = createState(props)
  }

  private renderItem = (
    item: IBranchListItem,
    matches: ReadonlyArray<number>
  ) => {
    const branch = item.branch
    const commit = branch.tip
    const currentBranchName = this.props.currentBranch
      ? this.props.currentBranch.name
      : null
    return (
      <BranchListItem
        name={branch.name}
        isCurrentBranch={branch.name === currentBranchName}
        lastCommitDate={commit ? commit.author.date : null}
        matches={matches}
      />
    )
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

  private renderGroupHeader = (id: string) => {
    const identifier = id as BranchGroupIdentifier
    return (
      <div className="branches-list-content filter-list-group-header">
        {this.getGroupLabel(identifier)}
      </div>
    )
  }

  private onItemClick = (item: IBranchListItem) => {
    if (this.props.onItemClick) {
      this.props.onItemClick(item.branch)
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

  public componentWillReceiveProps(nextProps: IBranchListProps) {
    this.setState(createState(nextProps))
  }

  public render() {
    return (
      <BranchesFilterList
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
        renderPostFilter={this.renderNewButton}
        renderNoItems={this.renderNoItems}
      />
    )
  }

  private renderNoItems = () => {
    return (
      <NoBranches
        onCreateNewBranch={this.onCreateNewBranch}
        canCreateNewBranch={this.props.canCreateNewBranch}
      />
    )
  }

  private renderNewButton = () => {
    if (this.props.canCreateNewBranch) {
      return (
        <Button className="new-branch-button" onClick={this.onCreateNewBranch}>
          {__DARWIN__ ? 'New Branch' : 'New branch'}
        </Button>
      )
    } else {
      return null
    }
  }

  private onCreateNewBranch = () => {
    if (this.props.onCreateNewBranch) {
      this.props.onCreateNewBranch(this.props.filterText)
    }
  }
}
