import * as React from 'react'
import CommitList from './commit-list'
import CommitSummaryContainer from './commit-summary-container'
import FileDiff from '../file-diff'
import Repository from '../../models/repository'
import {Commit, LocalGitOperations, IFileStatus} from '../../lib/local-git-operations'

interface IHistoryProps {
  readonly repository: Repository
}

interface IHistorySelection {
  readonly commit: Commit | null
  readonly file: IFileStatus | null
}

interface IHistoryState {
  readonly commits: ReadonlyArray<Commit>
  readonly selection: IHistorySelection
}

/** The History component. Contains the commit list, commit summary, and diff. */
export default class History extends React.Component<IHistoryProps, IHistoryState> {
  public constructor(props: IHistoryProps) {
    super(props)

    this.state = {commits: new Array<Commit>(), selection: {commit: null, file: null}}
  }

  public async componentDidMount() {
    const commits = await LocalGitOperations.getHistory(this.props.repository)
    this.setState(Object.assign({}, this.state, {commits}))
  }

  private onCommitSelected(commit: Commit) {
    const newSelection = {commit, file: null}
    this.setState(Object.assign({}, this.state, {selection: newSelection}))
  }

  private onFileSelected(file: IFileStatus) {
    const newSelection = {commit: this.state.selection.commit, file}
    this.setState(Object.assign({}, this.state, {selection: newSelection}))
  }

  public render() {
    const commit = this.state.selection.commit
    return (
      <div id='history'>
        <CommitList commits={this.state.commits}
                    selectedCommit={this.state.selection.commit}
                    onCommitSelected={row => this.onCommitSelected(row)}/>
        <CommitSummaryContainer repository={this.props.repository}
                                commit={commit}
                                selectedFile={this.state.selection.file}
                                onSelectedFileChanged={file => this.onFileSelected(file)}/>
        <FileDiff path={null}/>
      </div>
    )
  }
}
