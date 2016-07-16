import * as React from 'react'
import CommitList from './commit-list'
import CommitSummary from './commit-summary'
import FileDiff from '../file-diff'
import Repository from '../../models/repository'
import {Commit, LocalGitOperations} from '../../lib/local-git-operations'

interface IHistoryProps {
  repository: Repository
}

interface IHistoryState {
  commits: Commit[]
  selectedRow: number
}

/** The History component. Contains the commit list, commit summary, and diff. */
export default class History extends React.Component<IHistoryProps, IHistoryState> {
  public constructor(props: IHistoryProps) {
    super(props)

    this.state = {commits: [], selectedRow: -1}
  }

  public async componentDidMount() {
    const commits = await LocalGitOperations.getHistory(this.props.repository)
    this.setState(Object.assign({}, this.state, {commits}))
  }

  private selectionChanged(row: number) {
    this.setState(Object.assign({}, this.state, {selectedRow: row}))
  }

  public render() {
    return (
      <div id='history'>
        <CommitList commits={this.state.commits}
                    selectedRow={this.state.selectedRow}
                    onSelectionChanged={row => this.selectionChanged(row)}/>
        <CommitSummary/>
        <FileDiff path={null} />
      </div>
    )
  }
}
