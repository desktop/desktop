import * as React from 'react'
import { List } from '../list'
import { Dispatcher } from '../../lib/dispatcher'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { groupedAndFilteredBranches, BranchListItemModel } from './grouped-and-filtered-branches'
import { BranchListItem } from './branch'

const RowHeight = 30

interface IBranchesProps {
  readonly defaultBranch: Branch | null
  readonly currentBranch: Branch | null
  readonly allBranches: ReadonlyArray<Branch>
  readonly recentBranches: ReadonlyArray<Branch>
  readonly dispatcher: Dispatcher
  readonly repository: Repository
}

interface IBranchesState {
  readonly filter: string
  readonly branchItems: ReadonlyArray<BranchListItemModel>
  readonly selectedRow: number
}

export class Branches extends React.Component<IBranchesProps, IBranchesState> {
  private list: List | null = null
  private scrollToRow = -1

  public constructor(props: IBranchesProps) {
    super(props)

    this.state = this.createState(props, '', -1)
  }

  private createState(props: IBranchesProps, newFilter: string, newSelectedRow: number): IBranchesState {
    const branchItems = groupedAndFilteredBranches(
      this.props.defaultBranch,
      this.props.currentBranch,
      this.props.allBranches,
      this.props.recentBranches,
      newFilter
    )

    const selectedRow = newSelectedRow < 0 || newSelectedRow >= branchItems.length
      ? branchItems.findIndex(item => item.kind === 'branch')
      : newSelectedRow

    const filter = newFilter

    return { filter, selectedRow, branchItems }
  }

  private receiveProps(nextProps: IBranchesProps) {
    this.setState(this.createState(nextProps, this.state.filter, this.state.selectedRow))
  }

  public componentWillReceiveProps(nextProps: IBranchesProps) {
    this.receiveProps(nextProps)
  }

  private renderRow = (row: number) => {
    const item = this.state.branchItems[row]
    if (item.kind === 'branch') {
      const branch = item.branch
      const commit = branch.tip
      const currentBranchName = this.props.currentBranch ? this.props.currentBranch.name : null
      return <BranchListItem
        name={branch.name}
        isCurrentBranch={branch.name === currentBranchName}
        lastCommitDate={commit ? commit.author.date : null}/>
    } else {
      return <div className='branches-list-content branches-list-label'>{item.label}</div>
    }
  }

  private onRowClick = (row: number) => {
    const item = this.state.branchItems[row]
    if (item.kind !== 'branch') { return }

    const branch = item.branch
    this.props.dispatcher.closeFoldout()
    this.props.dispatcher.checkoutBranch(this.props.repository, branch.nameWithoutRemote)
  }

  private canSelectRow = (row: number) => {
    const item = this.state.branchItems[row]
    return item.kind === 'branch'
  }

  private onFilterChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const text = event.currentTarget.value
    this.setState(this.createState(this.props, text, this.state.selectedRow))
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const list = this.list
    if (!list) { return }

    let nextRow = this.state.selectedRow
    if (event.key === 'ArrowDown') {
      nextRow = list.nextSelectableRow('down', this.state.selectedRow)
      event.preventDefault()
    } else if (event.key === 'ArrowUp') {
      nextRow = list.nextSelectableRow('up', this.state.selectedRow)
      event.preventDefault()
    } else if (event.key === 'Enter') {
      this.onRowClick(this.state.selectedRow)
      event.preventDefault()
    } else if (event.key === 'Escape') {
      if (this.state.filter.length === 0) {
        this.props.dispatcher.closeFoldout()
        event.preventDefault()
        return
      }
    } else {
      return
    }

    this.scrollToRow = nextRow
    this.setState(this.createState(this.props, this.state.filter, nextRow))
  }

  private storeListRef = (ref: List) => {
    this.list = ref
  }

  public render() {
    const scrollToRow = this.scrollToRow
    this.scrollToRow = -1

    return (
      <div id='branches'>
        <input className='branch-filter-input'
               type='search'
               autoFocus={true}
               placeholder='Filter'
               onChange={this.onFilterChanged}
               onKeyDown={this.onKeyDown}/>

        <div className='branches-list-container'>
          <List rowCount={this.state.branchItems.length}
                rowRenderer={this.renderRow}
                rowHeight={RowHeight}
                selectedRow={this.state.selectedRow}
                onRowClick={this.onRowClick}
                canSelectRow={this.canSelectRow}
                scrollToRow={scrollToRow}
                ref={this.storeListRef}
                invalidationProps={this.props}/>
        </div>
      </div>
    )
  }
}
