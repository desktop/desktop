import * as React from 'react'
import Repository from '../../models/repository'
import {Commit, LocalGitOperations, IFileStatus} from '../../lib/local-git-operations'
import CommitSummary from './commit-summary'

interface ICommitSummaryContainerProps {
  repository: Repository
  commit: Commit
}

interface ICommitSummaryContainerState {
  files: ReadonlyArray<IFileStatus>
}

/** A component which displays a commit's summary. */
export default class CommitSummaryContainer extends React.Component<ICommitSummaryContainerProps, ICommitSummaryContainerState> {
  public constructor(props: ICommitSummaryContainerProps) {
    super(props)

    this.state = { files: new Array<IFileStatus>() }
  }

  public componentDidMount() {
    this.reload(this.props)
  }

  public componentWillReceiveProps(nextProps: ICommitSummaryContainerProps) {
    this.reload(nextProps)
  }

  private async reload(props: ICommitSummaryContainerProps) {
    this.setState({files: new Array<IFileStatus>()})

    const files = await LocalGitOperations.getChangedFiles(props.repository, props.commit.sha)
    this.setState({files})
  }

  private renderCommit() {
    return <CommitSummary summary={this.props.commit.summary}
                          body={this.props.commit.body}
                          files={this.state.files}/>
  }

  public render() {
    return (
      <div id='commit-summary'>
        {this.props.commit ? this.renderCommit() : <NoCommitSelected/>}
      </div>
    )
  }
}

function NoCommitSelected() {
  return <div>No commit selected</div>
}
