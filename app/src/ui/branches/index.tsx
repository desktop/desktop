import * as React from 'react'
import List from '../list'
import { Dispatcher } from '../../lib/dispatcher'
import Repository from '../../models/repository'
import { Branch } from '../../lib/local-git-operations'
import { groupedBranches, BranchListItem } from './grouped-branches'

const RowHeight = 22

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
      return <div>{branch.name}</div>
    } else {
      return <div><strong>{item.label}</strong></div>
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

  private groupedAndFilteredBranches(): ReadonlyArray<BranchListItem> {
    if (this.state.filter.length < 1) {
      return groupedBranches(this.props.defaultBranch, this.props.currentBranch, this.props.allBranches, this.props.recentBranches)
    }

    let defaultBranch = this.props.defaultBranch
    if (defaultBranch) {
      if (!defaultBranch.name.includes(this.state.filter)) {
        defaultBranch = null
      }
    }

    let currentBranch = this.props.currentBranch
    if (currentBranch) {
      if (!currentBranch.name.includes(this.state.filter)) {
        currentBranch = null
      }
    }

    const allBranches = this.props.allBranches.filter(b => b.name.includes(this.state.filter))
    const recentBranches = this.props.recentBranches.filter(b => b.name.includes(this.state.filter))

    return groupedBranches(defaultBranch, currentBranch, allBranches, recentBranches)
  }

  public render() {
    const branchItems = this.groupedAndFilteredBranches()
    return (
      <div id='branches' className='panel'>
        <input type='search' autoFocus={true} placeholder='Filter' onChange={event => this.onFilterChanged(event)}/>

        <hr/>

        <List rowCount={branchItems.length}
              rowRenderer={row => this.renderRow(branchItems, row)}
              rowHeight={RowHeight}
              selectedRow={-1}
              onSelectionChanged={row => this.onSelectionChanged(branchItems, row)}/>
      </div>
    )
  }
}
