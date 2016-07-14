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

  public componentDidMount() {
    this.update(this.props)
  }

  public componentWillReceiveProps(nextProps: ICommitSummaryProps) {
    this.update(nextProps)
  }

  private async update(props: ICommitSummaryProps) {
    this.setState({files: new Array<IFileStatus>()})

    const files = await LocalGitOperations.getChangedFiles(props.repository, props.commit.sha)
    this.setState({files})
  }

  private renderNoCommitSelected() {
    return <div>No commit selected</div>
  }

  private renderCommit() {
    return (
      <div>
        <div>{this.props.commit.summary}</div>
        <div>&nbsp;</div>
        <div>{this.props.commit.body}</div>
        <ul>
          {this.state.files.map(f => <li key={f.name}>{f.name}</li>)}
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
