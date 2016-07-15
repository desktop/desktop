import * as React from 'react'
import CommitList from './commit-list'
import CommitSummaryContainer from './commit-summary-container'
import FileDiff from '../file-diff'
import Repository from '../../models/repository'
import {Commit, LocalGitOperations} from '../../lib/local-git-operations'

interface IHistoryProps {
  readonly repository: Repository
}

interface IHistorySelection {
  readonly commit: Commit | null
  readonly path: string | null
}

interface IHistoryState {
  readonly commits: ReadonlyArray<Commit>
  readonly selection: IHistorySelection
}

/** The History component. Contains the commit list, commit summary, and diff. */
export default class History extends React.Component<IHistoryProps, IHistoryState> {
  public constructor(props: IHistoryProps) {
    super(props)

    this.state = {commits: new Array<Commit>(), selection: {commit: null, path: null}}
  }

  public async componentDidMount() {
    const commits = await LocalGitOperations.getHistory(this.props.repository)
    this.setState(Object.assign({}, this.state, {commits}))
  }

  private onCommitSelected(commit: Commit) {
    const newSelection = {commit, path: null}
    this.setState(Object.assign({}, this.state, {selection: newSelection}))
  }

  public render() {
    const commit = this.state.selection.commit
    return (
      <div id='history'>
        <CommitList commits={this.state.commits}
                    selectedCommit={this.state.selection.commit}
                    onCommitSelected={row => this.onCommitSelected(row)}/>
        <CommitSummaryContainer repository={this.props.repository} commit={commit}/>
        <FileDiff/>
      </div>
    )
  }
}
