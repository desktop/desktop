import * as React from 'react'
import { Branch } from '../../models/branch'
import { groupBranches, IBranchListItem, BranchGroupIdentifier } from './group-branches'
import { BranchListItem } from './branch'
import { FilterList, IFilterListGroup, SelectionSource } from '../lib/filter-list'
import { assertNever } from '../../lib/fatal-error'

/**
 * TS can't parse generic specialization in JSX, so we have to alias it here
 * with the generic type. See https://github.com/Microsoft/TypeScript/issues/6395.
 */
const BranchesFilterList: new() => FilterList<IBranchListItem> = FilterList as any

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
  readonly onFilterKeyDown?: (filter: string, event: React.KeyboardEvent<HTMLInputElement>) => void

  /** Called when an item is clicked. */
  readonly onItemClick?: (item: Branch) => void

  /**
   * This function will be called when the selection changes as a result of a
   * user keyboard or mouse action (i.e. not when props change). Note that this
   * differs from `onRowSelected`. For example, it won't be called if an already
   * selected row is clicked on.
   *
   * @param selectedItem - The Branch that was just selected
   * @param source       - The kind of user action that provoked the change,
   *                       either a pointer device press, or a keyboard event
   *                       (arrow up/down)
   */
  readonly onSelectionChanged?: (selectedItem: Branch | null, source: SelectionSource) => void
}

interface IBranchListState {
  readonly groups: ReadonlyArray<IFilterListGroup<IBranchListItem>>
  readonly selectedItem: IBranchListItem | null
}

function createState(props: IBranchListProps): IBranchListState {
  const groups = groupBranches(props.defaultBranch, props.currentBranch, props.allBranches, props.recentBranches)

  let selectedItem: IBranchListItem | null = null
  const selectedBranch = props.selectedBranch
  if (selectedBranch) {
    for (const group of groups) {
      selectedItem = group.items.find(i => {
        const branch = i.branch
        return branch.name === selectedBranch.name
      }) || null

      if (selectedItem) { break }
    }
  }

  return { groups, selectedItem }
}

/** The Branches list component. */
export class BranchList extends React.Component<IBranchListProps, IBranchListState> {

  public constructor(props: IBranchListProps) {
    super(props)
    this.state = createState(props)
  }

  private renderItem = (item: IBranchListItem) => {
    const branch = item.branch
    const commit = branch.tip
    const currentBranchName = this.props.currentBranch ? this.props.currentBranch.name : null
    return <BranchListItem
      name={branch.name}
      isCurrentBranch={branch.name === currentBranchName}
      lastCommitDate={commit ? commit.author.date : null}/>
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

  private renderGroupHeader = (identifier: BranchGroupIdentifier) => {
    return <div className='branches-list-content filter-list-group-header'>{this.getGroupLabel(identifier)}</div>
  }

  private onItemClick = (item: IBranchListItem) => {
    if (this.props.onItemClick) {
      this.props.onItemClick(item.branch)
    }
  }

  private onSelectionChanged = (selectedItem: IBranchListItem | null, source: SelectionSource) => {
    if (this.props.onSelectionChanged) {
      this.props.onSelectionChanged(selectedItem ? selectedItem.branch : null, source)
    }
  }

  public componentWillReceiveProps(nextProps: IBranchListProps) {
    this.setState(createState(nextProps))
  }

  public render() {
    return (
      <BranchesFilterList
        className='branches-list'
        rowHeight={RowHeight}
        selectedItem={this.state.selectedItem}
        renderItem={this.renderItem}
        renderGroupHeader={this.renderGroupHeader}
        onItemClick={this.onItemClick}
        onFilterKeyDown={this.props.onFilterKeyDown}
        onSelectionChanged={this.onSelectionChanged}
        groups={this.state.groups}
        invalidationProps={this.props.allBranches}/>
    )
  }
}
