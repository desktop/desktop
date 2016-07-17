import * as React from 'react'
import CommitList from './commit-list'
import CommitSummaryContainer from './commit-summary-container'
import FileDiff from '../file-diff'
import Repository from '../../models/repository'
import {FileChange} from '../../models/status'
import {Commit, LocalGitOperations} from '../../lib/local-git-operations'
import {Dispatcher} from '../../lib/dispatcher'

interface IHistoryProps {
  readonly repository: Repository
  readonly selection: IHistorySelection
  readonly dispatcher: Dispatcher
  readonly files: ReadonlyArray<FileChange>
}

interface IHistorySelection {
  readonly commit: Commit | null
  readonly file: FileChange | null
}

interface IHistoryState {
  readonly commits: ReadonlyArray<Commit>
}

/** The History component. Contains the commit list, commit summary, and diff. */
export default class History extends React.Component<IHistoryProps, IHistoryState> {
  public constructor(props: IHistoryProps) {
    super(props)

    this.state = {commits: new Array<Commit>() }
  }

  public async componentDidMount() {
    const commits = await LocalGitOperations.getHistory(this.props.repository)
    this.setState(Object.assign({}, this.state, {commits}))
  }

  private onCommitSelected(commit: Commit) {
    const newSelection = {commit, file: null}
    this.props.dispatcher.changeHistorySelection(this.props.repository, newSelection)
  }

  private onFileSelected(file: FileChange) {
    const newSelection = {commit: this.props.selection.commit, file}
    this.props.dispatcher.changeHistorySelection(this.props.repository, newSelection)
  }

  public render() {
    const commit = this.props.selection.commit
    const selectedFile = this.props.selection.file
    return (
      <div id='history'>
        <CommitList commits={this.state.commits}
                    selectedCommit={this.props.selection.commit}
                    onCommitSelected={row => this.onCommitSelected(row)}/>
        <CommitSummaryContainer repository={this.props.repository}
                                commit={commit}
                                files={this.props.files}
                                selectedFile={this.props.selection.file}
                                onSelectedFileChanged={file => this.onFileSelected(file)}/>
        <FileDiff path={selectedFile ? selectedFile.path : null}/>
      </div>
    )
  }
}
