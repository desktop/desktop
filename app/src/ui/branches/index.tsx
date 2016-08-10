import * as React from 'react'
import List from '../list'
import { Dispatcher } from '../../lib/dispatcher'
import Repository from '../../models/repository'
import { LocalGitOperations, Branch } from '../../lib/local-git-operations'

const RowHeight = 22

// interface IGrouped {
//   readonly current: Branch
//   readonly recent: ReadonlyArray<Branch>
//   readonly other: ReadonlyArray<Branch>
// }

const groupedBranches = new Map<number, number>()

interface IBranchesProps {
  readonly branches: ReadonlyArray<Branch>
  readonly dispatcher: Dispatcher
  readonly repository: Repository
}

export default class Branches extends React.Component<IBranchesProps, void> {
  public componentDidMount() {
    this.props.dispatcher.loadBranches(this.props.repository)
  }

  private renderRow(row: number) {
    const branch = this.props.branches[row]
    return <div>{branch.name}</div>
  }

  private onSelectionChanged(row: number) {
    const branch = this.props.branches[row]

    this.props.dispatcher.closePopup()
    this.props.dispatcher.checkoutBranch(this.props.repository, branch.name)
  }

  public render() {
    const grouped = groupedBranches.get(this.props.repository.id!)
    if (!grouped) {
      groupBranches(this.props.repository, this.props.branches).then(() => this.forceUpdate())
    }

    return (
      <div id='branches' className='panel'>
        <List rowCount={this.props.branches.length}
              rowRenderer={row => this.renderRow(row)}
              rowHeight={RowHeight}
              selectedRow={-1}
              onSelectionChanged={row => this.onSelectionChanged(row)}/>
      </div>
    )
  }
}

async function groupBranches(repository: Repository, branches: ReadonlyArray<Branch>): Promise<void> {
  await LocalGitOperations.getRecentBranches(repository)
  groupedBranches.set(repository.id!, 1)
}
