import * as React from 'react'
import Repository from '../../models/repository'
import {Commit, LocalGitOperations, IFileStatus} from '../../lib/local-git-operations'

interface ICommitSummaryProps {
  repository: Repository
  commit: Commit
}

interface ICommitSummaryState {
  files: ReadonlyArray<IFileStatus>
}

/** A component which displays a commit's summary. */
export default class CommitSummary extends React.Component<ICommitSummaryProps, ICommitSummaryState> {
  public constructor(props: ICommitSummaryProps) {
    super(props)

    this.state = {files: new Array<IFileStatus>()}
  }

  public async componentDidMount() {
    console.log('mount!!')
    const files = await LocalGitOperations.getChangedFiles(this.props.repository, this.props.commit.sha)
    this.setState({files})
  }

  private renderNoCommitSelected() {
    return <div>No commit selected</div>
  }

  private renderCommit() {
    return (
      <div>
        <div>{this.props.commit.summary}</div>
        <div>{this.props.commit.body}</div>
        <ul>
          {this.state.files.map(f => <li>f.name</li>)}
        </ul>
      </div>
    )
  }

  public render() {
    return (
      <div id='commit-summary'>
        {this.props.commit ? this.renderCommit() : this.renderNoCommitSelected()}
      </div>
    )
  }
}
