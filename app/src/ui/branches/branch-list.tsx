import * as React from 'react'
import { Branch } from '../../models/branch'
import { groupBranches, IBranchListItem, BranchGroupIdentifier } from './group-branches'
import { BranchListItem } from './branch'
import { FilterList } from '../lib/filter-list'
import { assertNever } from '../../lib/fatal-error'

/**
 * TS can't parse generic specialization in JSX, so we have to alias it here
 * with the generic type. See https://github.com/Microsoft/TypeScript/issues/6395.
 */
const BranchesFilterList: new() => FilterList<IBranchListItem> = FilterList as any

const RowHeight = 30

interface IBranchListProps {
  readonly defaultBranch: Branch | null
  readonly currentBranch: Branch | null
  readonly allBranches: ReadonlyArray<Branch>
  readonly recentBranches: ReadonlyArray<Branch>

  /**
   * Called when a key down happens in the filter field. Users have a chance to
   * respond or cancel the default behavior by calling `preventDefault`.
   */
  readonly onFilterKeyDown?: (filter: string, event: React.KeyboardEvent<HTMLInputElement>) => void

  /** Called when an item is clicked. */
  readonly onItemClick: (item: Branch) => void
}

/** The Branches list component. */
export class BranchList extends React.Component<IBranchListProps, void> {
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
      return 'Default Branch'
    } else if (identifier === 'recent') {
      return 'Recent Branches'
    } else if (identifier === 'other') {
      return 'Other Branches'
    } else {
      return assertNever(identifier, `Unknown identifier: ${identifier}`)
    }
  }

  private renderGroupHeader = (identifier: BranchGroupIdentifier) => {
    return <div className='branches-list-content branches-list-label'>{this.getGroupLabel(identifier)}</div>
  }

  private onItemClick = (item: IBranchListItem) => {
    const branch = item.branch
    this.props.onItemClick(branch)
  }

  public render() {
    const groups = groupBranches(this.props.defaultBranch, this.props.currentBranch, this.props.allBranches, this.props.recentBranches)

    let selectedItem: IBranchListItem | null = null
    const currentBranch = this.props.currentBranch
    if (currentBranch) {
      for (const group of groups) {
        selectedItem = group.items.find(i => {
          const branch = i.branch
          return branch.name === currentBranch.name
        }) || null

        if (selectedItem) { break }
      }
    }

    return (
      <BranchesFilterList
        className='branches-list'
        rowHeight={RowHeight}
        selectedItem={selectedItem}
        renderItem={this.renderItem}
        renderGroupHeader={this.renderGroupHeader}
        onItemClick={this.onItemClick}
        onFilterKeyDown={this.props.onFilterKeyDown}
        groups={groups}
        invalidationProps={this.props.allBranches}/>
    )
  }
}
