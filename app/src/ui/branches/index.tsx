import * as React from 'react'
import List from '../list'
import { Dispatcher } from '../../lib/dispatcher'
import Repository from '../../models/repository'
import { Branch } from '../../lib/local-git-operations'
import { groupedAndFilteredBranches, BranchListItem } from './grouped-and-filtered-branches'
import { default as BranchView } from './branch'

const RowHeight = 25

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
}

export default class Branches extends React.Component<IBranchesProps, IBranchesState> {
  public constructor(props: IBranchesProps) {
    super(props)

    this.state = { filter: '' }
  }

  public componentDidMount() {
    this.props.dispatcher.loadBranches(this.props.repository)
  }

  private renderRow(branchItems: ReadonlyArray<BranchListItem>, row: number) {
    const item = branchItems[row]
    if (item.kind === 'branch') {
      const branch = item.branch
      const currentBranchName = this.props.currentBranch ? this.props.currentBranch.name : null
      return <BranchView name={branch.name}
                         isCurrentBranch={branch.name === currentBranchName}
                         lastCommitDate={new Date()}/>
    } else {
      return <div className='branches-list-content branches-list-label'>{item.label}</div>
    }
  }

  private onSelectionChanged(branchItems: ReadonlyArray<BranchListItem>, row: number) {
    const item = branchItems[row]
    if (item.kind !== 'branch') { return }

    const branch = item.branch
    this.props.dispatcher.closePopup()
    this.props.dispatcher.checkoutBranch(this.props.repository, branch.name)
  }

  private onFilterChanged(event: React.FormEvent<HTMLInputElement>) {
    const text = event.target.value
    this.setState({ filter: text })
  }

  public render() {
    const branchItems = groupedAndFilteredBranches(this.props.defaultBranch, this.props.currentBranch, this.props.allBranches, this.props.recentBranches, this.state.filter)
    return (
      <div id='branches' className='panel'>
        <input type='search' autoFocus={true} placeholder='Filter' onChange={event => this.onFilterChanged(event)}/>

        <div className='panel popup-content branches-list-container'>
          <List rowCount={branchItems.length}
                rowRenderer={row => this.renderRow(branchItems, row)}
                rowHeight={RowHeight}
                selectedRow={-1}
                onSelectionChanged={row => this.onSelectionChanged(branchItems, row)}/>
        </div>
      </div>
    )
  }
}
