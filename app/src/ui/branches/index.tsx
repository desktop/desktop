import * as React from 'react'
import { Dispatcher } from '../../lib/dispatcher'
import { Repository } from '../../models/repository'
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

interface IBranchesProps {
  readonly defaultBranch: Branch | null
  readonly currentBranch: Branch | null
  readonly allBranches: ReadonlyArray<Branch>
  readonly recentBranches: ReadonlyArray<Branch>
  readonly dispatcher: Dispatcher
  readonly repository: Repository
}

/** The Branches list component. */
export class Branches extends React.Component<IBranchesProps, void> {
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
    this.props.dispatcher.closeFoldout()
    this.props.dispatcher.checkoutBranch(this.props.repository, branch.nameWithoutRemote)
  }

  private onFilterKeyDown = (filter: string, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      if (filter.length === 0) {
        this.props.dispatcher.closeFoldout()
        event.preventDefault()
      }
    }
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
      <div className='branches-list-container'>
        <BranchesFilterList
          className='branches-list'
          rowHeight={RowHeight}
          selectedItem={selectedItem}
          renderItem={this.renderItem}
          renderGroupHeader={this.renderGroupHeader}
          onItemClick={this.onItemClick}
          onFilterKeyDown={this.onFilterKeyDown}
          groups={groups}
          invalidationProps={this.props.allBranches}/>
      </div>
    )
  }
}
