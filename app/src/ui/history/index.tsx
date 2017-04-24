import * as React from 'react'
import { CommitSummary } from './commit-summary'
import { Diff } from '../diff'
import { FileList } from './file-list'
import { Repository } from '../../models/repository'
import { FileChange } from '../../models/status'
import { Commit } from '../../models/commit'
import { Dispatcher } from '../../lib/dispatcher'
import { IHistoryState as IAppHistoryState } from '../../lib/app-state'
import { ThrottledScheduler } from '../lib/throttled-scheduler'
import { IGitHubUser } from '../../lib/dispatcher'
import { Resizable } from '../resizable'

// At some point we'll make index.tsx only be exports
// see https://github.com/desktop/desktop/issues/383
export { HistorySidebar } from './sidebar'

interface IHistoryProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly history: IAppHistoryState
  readonly emoji: Map<string, string>
  readonly commits: Map<string, Commit>
  readonly localCommitSHAs: ReadonlyArray<string>
  readonly commitSummaryWidth: number
  readonly gitHubUsers: Map<string, IGitHubUser>
}

interface IHistoryState {
  readonly isExpanded: boolean,
}

/** The History component. Contains the commit list, commit summary, and diff. */
export class History extends React.Component<IHistoryProps, IHistoryState> {
  private readonly loadChangedFilesScheduler = new ThrottledScheduler(200)

  public constructor(props: IHistoryProps) {
    super(props)

    this.state = {
      isExpanded: false,
    }
  }

  private onFileSelected = (file: FileChange) => {
    this.props.dispatcher.changeHistoryFileSelection(this.props.repository, file)
  }

  public componentWillUpdate(nextProps: IHistoryProps) {
    // Reset isExpanded if we're switching commits.
    if (nextProps.history.selection.sha !== this.props.history.selection.sha) {
      if (this.state.isExpanded) {
        this.setState({ isExpanded: false })
      }
    }
  }

  public componentWillUnmount() {
    this.loadChangedFilesScheduler.clear()
  }

  private renderDiff(commit: Commit | null) {
    const files = this.props.history.changedFiles
    const file = this.props.history.selection.file
    const diff = this.props.history.diff

    if (!diff || !file) {
      // don't show both 'empty' messages
      const message = files.length === 0
        ? ''
        : 'No file selected'

      return (
        <div className='panel blankslate' id='diff'>
          { message }
        </div>
      )
    }

    return (
      <Diff repository={this.props.repository}
        file={file}
        diff={diff}
        readOnly={true}
        dispatcher={this.props.dispatcher} />
    )
  }

  private renderCommitSummary(commit: Commit) {
    const isLocal = this.props.localCommitSHAs.indexOf(commit.sha) > -1
    const gitHubUser = this.props.gitHubUsers.get(commit.author.email.toLowerCase()) || null

    return <CommitSummary
      summary={commit.summary}
      body={commit.body}
      sha={commit.sha}
      author={commit.author}
      files={this.props.history.changedFiles}
      emoji={this.props.emoji}
      repository={this.props.repository}
      isLocal={isLocal}
      gitHubUser={gitHubUser}
      onExpandChanged={this.onExpandChanged}
      isExpanded={this.state.isExpanded}
    />
  }

  private onExpandChanged = (isExpanded: boolean) => {
    this.setState({ isExpanded })
  }

  private onCommitSummaryReset = () => {
    this.props.dispatcher.resetCommitSummaryWidth()
  }

  private onCommitSummaryResize = (width: number) => {
    this.props.dispatcher.setCommitSummaryWidth(width)
  }

  private renderFileList() {
    const files = this.props.history.changedFiles
    if (files.length === 0) {
      return (
        <div className='fill-window'>
          No files in commit
        </div>
      )
    }

    // -1 for right hand side border
    const availableWidth = this.props.commitSummaryWidth - 1

    return (
      <FileList
          files={files}
          onSelectedFileChanged={this.onFileSelected}
          selectedFile={this.props.history.selection.file}
          availableWidth={availableWidth} />
      )
  }

  public render() {
    const sha = this.props.history.selection.sha
    const commit = sha ? (this.props.commits.get(sha) || null) : null

    if (!sha || !commit) {
      return <NoCommitSelected/>
    }

    const className = this.state.isExpanded ? 'expanded' : 'collapsed'

    return (
      <div id='history' className={className}>
        {this.renderCommitSummary(commit)}
        <div id='commit-details'>
          <Resizable
            width={this.props.commitSummaryWidth}
            onResize={this.onCommitSummaryResize}
            onReset={this.onCommitSummaryReset}>
            { this.renderFileList() }
          </Resizable>
          { this.renderDiff(commit) }
        </div>
      </div>
    )
  }
}

function NoCommitSelected() {
  return (
    <div className='panel blankslate'>
      No commit selected
    </div>
  )
}
