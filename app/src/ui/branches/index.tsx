import * as React from 'react'
import { Dispatcher } from '../../lib/dispatcher'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
<<<<<<< HEAD
import { groupBranches, IBranchListItem, BranchGroupIdentifier } from './group-branches'
import { BranchListItem } from './branch'
import { FilterList } from '../lib/filter-list'
import { assertNever } from '../../lib/fatal-error'

/**
 * TS can't parse generic specialization in JSX, so we have to alias it here
 * with the generic type. See https://github.com/Microsoft/TypeScript/issues/6395.
 */
const BranchesFilterList: new() => FilterList<IBranchListItem> = FilterList as any

const RowHeight = 29
=======
import { BranchList } from './branch-list'
>>>>>>> master

interface IBranchesProps {
  readonly defaultBranch: Branch | null
  readonly currentBranch: Branch | null
  readonly allBranches: ReadonlyArray<Branch>
  readonly recentBranches: ReadonlyArray<Branch>
  readonly dispatcher: Dispatcher
  readonly repository: Repository
}

interface IBranchesState {
  readonly selectedBranch: Branch | null
}

/** The Branches list component. */
export class Branches extends React.Component<IBranchesProps, IBranchesState> {

  public constructor(props: IBranchesProps) {
    super(props)

<<<<<<< HEAD
  private renderGroupHeader = (identifier: BranchGroupIdentifier) => {
    return <div className='branches-list-content filter-list-group-header'>{this.getGroupLabel(identifier)}</div>
=======
    this.state = { selectedBranch: props.currentBranch }
>>>>>>> master
  }

  private onItemClick = (item: Branch) => {
    this.props.dispatcher.closeFoldout()

    const currentBranch = this.props.currentBranch

    if (!currentBranch || currentBranch.name !== item.name) {
      this.props.dispatcher.checkoutBranch(this.props.repository, item.nameWithoutRemote)
    }
  }

  private onFilterKeyDown = (filter: string, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      if (filter.length === 0) {
        this.props.dispatcher.closeFoldout()
        event.preventDefault()
      }
    }
  }

  private onSelectionChanged = (selectedBranch: Branch) => {
    this.setState({ selectedBranch })
  }

  public render() {
    return (
      <div className='branches-list-container'>
        <BranchList
          defaultBranch={this.props.defaultBranch}
          currentBranch={this.props.currentBranch}
          allBranches={this.props.allBranches}
          recentBranches={this.props.recentBranches}
          onItemClick={this.onItemClick}
          onFilterKeyDown={this.onFilterKeyDown}
          selectedBranch={this.state.selectedBranch}
          onSelectionChanged={this.onSelectionChanged}
        />
      </div>
    )
  }
}
