import * as React from 'react'
import List from '../list'
import Repository from '../../models/repository'

const RowHeight = 22

interface IBranchesProps {
  readonly branches: ReadonlyArray<string>
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
    console.log(`Check out ${branch}`)
  }

  public render() {
    return (
      <List rowCount={this.props.branches.length}
            rowRenderer={row => this.renderRow(row)}
            rowHeight={RowHeight}
            selectedRow={-1}
            onSelectionChanged={row => this.onSelectionChanged(row)}/>
    )
  }
}
