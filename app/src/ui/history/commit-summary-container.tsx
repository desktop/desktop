import * as React from 'react'
import Repository from '../../models/repository'
import {FileChange} from '../../models/status'
import {Commit, LocalGitOperations} from '../../lib/local-git-operations'
import CommitSummary from './commit-summary'

interface ICommitSummaryContainerProps {
  readonly repository: Repository
  readonly commit: Commit | null
  readonly selectedFile: FileChange | null
  readonly onSelectedFileChanged: (file: FileChange) => void
}

interface ICommitSummaryContainerState {
  readonly files: ReadonlyArray<FileChange>
}

/** A component which displays a commit's summary. */
export default class CommitSummaryContainer extends React.Component<ICommitSummaryContainerProps, ICommitSummaryContainerState> {
  public constructor(props: ICommitSummaryContainerProps) {
    super(props)

    this.state = { files: new Array<FileChange>() }
  }

  public componentDidMount() {
    this.reload(this.props)
  }

  public componentWillReceiveProps(nextProps: ICommitSummaryContainerProps) {
    this.reload(nextProps)
  }

  private async reload(props: ICommitSummaryContainerProps) {
    if (props.commit && this.props.commit && props.commit.sha === this.props.commit.sha) { return }

    this.setState({files: new Array<FileChange>()})

    requestIdleCallback(async () => {
      const commit = props.commit
      if (!commit) { return }

      const files = await LocalGitOperations.getChangedFiles(props.repository, commit.sha)
      if (this.props.commit && commit.sha !== this.props.commit.sha) { return }

      this.setState({files})
    })
  }

  private renderCommit() {
    if (!this.props.commit) {
      return <NoCommitSelected/>
    }

    return <CommitSummary summary={this.props.commit.summary}
                          body={this.props.commit.body}
                          files={this.state.files}
                          selectedFile={this.props.selectedFile}
                          onSelectedFileChanged={file => this.props.onSelectedFileChanged(file)}/>
  }

  public render() {
    return (
      <div id='commit-summary'>
        {this.renderCommit()}
      </div>
    )
  }
}

function NoCommitSelected() {
  return <div>No commit selected</div>
}
