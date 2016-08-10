import * as React from 'react'
import List from '../list'
import { Dispatcher } from '../../lib/dispatcher'
import Repository from '../../models/repository'
import { Branch } from '../../lib/local-git-operations'

const RowHeight = 22

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
    return <div>{branch}</div>
  }

  private onSelectionChanged(row: number) {
    const branch = this.props.branches[row]

    this.props.dispatcher.closePopup()
    this.props.dispatcher.checkoutBranch(this.props.repository, branch.name)
  }

  public render() {
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
