import * as React from 'react'
import { List } from '../list'
import { Dispatcher } from '../../lib/dispatcher'
import { Repository } from '../../models/repository'
import { Branch, Commit } from '../../lib/local-git-operations'
import { groupedAndFilteredBranches, BranchListItemModel } from './grouped-and-filtered-branches'
import { BranchListItem } from './branch'

const RowHeight = 25

interface IBranchesProps {
  readonly defaultBranch: Branch | null
  readonly currentBranch: Branch | null
  readonly allBranches: ReadonlyArray<Branch>
  readonly recentBranches: ReadonlyArray<Branch>
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly commits: Map<string, Commit>
}

interface IBranchesState {
  readonly filter: string
}

export class Branches extends React.Component<IBranchesProps, IBranchesState> {
  private list: List | null = null
  private scrollToRow = -1
  private selectedRow = -1

  public constructor(props: IBranchesProps) {
    super(props)

    this.state = { filter: '' }
  }

  private renderRow(branchItems: ReadonlyArray<BranchListItemModel>, row: number) {
    const item = branchItems[row]
    if (item.kind === 'branch') {
      const branch = item.branch
      const commit = this.props.commits.get(branch.sha)
      const currentBranchName = this.props.currentBranch ? this.props.currentBranch.name : null
      return <BranchListItem
        name={branch.name}
        isCurrentBranch={branch.name === currentBranchName}
        lastCommitDate={commit ? commit.authorDate : null}/>
    } else {
      return <div className='branches-list-content branches-list-label'>{item.label}</div>
    }
  }

  private onRowSelected(branchItems: ReadonlyArray<BranchListItemModel>, row: number) {
    const item = branchItems[row]
    if (item.kind !== 'branch') { return }

    const branch = item.branch
    this.props.dispatcher.closePopup()
    this.props.dispatcher.checkoutBranch(this.props.repository, branch.nameWithoutRemote)
  }

  private canSelectRow(branchItems: ReadonlyArray<BranchListItemModel>, row: number) {
    const item = branchItems[row]
    return item.kind === 'branch'
  }

  private onFilterChanged(event: React.FormEvent<HTMLInputElement>) {
    const text = event.currentTarget.value
    this.setState({ filter: text })
  }

  private onKeyDown(branchItems: ReadonlyArray<BranchListItemModel>, event: React.KeyboardEvent<HTMLInputElement>) {
    const list = this.list
    if (!list) { return }

    let nextRow = this.selectedRow
    if (event.key === 'ArrowDown') {
      nextRow = list.nextSelectableRow('down', this.selectedRow)
    } else if (event.key === 'ArrowUp') {
      nextRow = list.nextSelectableRow('up', this.selectedRow)
    } else if (event.key === 'Enter') {
      this.onRowSelected(branchItems, this.selectedRow)
    } else if (event.key === 'Escape') {
      if (this.state.filter.length === 0) {
        this.props.dispatcher.closePopup()
        return
      }
    } else {
      return
    }

    this.scrollToRow = nextRow
    this.selectedRow = nextRow
    this.forceUpdate()
  }

  public render() {
    const scrollToRow = this.scrollToRow
    this.scrollToRow = -1

    const branchItems = groupedAndFilteredBranches(this.props.defaultBranch, this.props.currentBranch, this.props.allBranches, this.props.recentBranches, this.state.filter)
    let selectedRow = this.selectedRow
    if (selectedRow < 0 || selectedRow >= branchItems.length) {
      selectedRow = branchItems.findIndex(item => item.kind === 'branch')
    }

    this.selectedRow = selectedRow

    return (
      <div id='branches'>
        <input className='branch-filter-input'
               type='search'
               autoFocus={true}
               placeholder='Filter'
               onChange={event => this.onFilterChanged(event)}
               onKeyDown={event => this.onKeyDown(branchItems, event)}/>

        <div className='popup-inner-content branches-list-container'>
          <List rowCount={branchItems.length}
                rowRenderer={row => this.renderRow(branchItems, row)}
                rowHeight={RowHeight}
                selectedRow={selectedRow}
                onRowSelected={row => this.onRowSelected(branchItems, row)}
                canSelectRow={row => this.canSelectRow(branchItems, row)}
                scrollToRow={scrollToRow}
                ref={ref => this.list = ref}
                invalidationProps={this.props}/>
        </div>
      </div>
    )
  }
}
