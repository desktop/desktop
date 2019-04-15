import * as React from 'react'
import * as Path from 'path'

import { CommitSummary } from './commit-summary'
import { Diff } from '../diff'
import { FileList } from './file-list'
import { Repository } from '../../models/repository'
import { CommittedFileChange } from '../../models/status'
import { Commit } from '../../models/commit'
import { Dispatcher } from '../dispatcher'
import { encodePathAsUrl } from '../../lib/path'
import { ThrottledScheduler } from '../lib/throttled-scheduler'
import { IGitHubUser } from '../../lib/databases'
import { Resizable } from '../resizable'
import { openFile } from '../lib/open-file'
import { IDiff, ImageDiffType } from '../../models/diff'

interface ISelectedCommitProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly emoji: Map<string, string>
  readonly selectedCommit: Commit | null
  readonly changedFiles: ReadonlyArray<CommittedFileChange>
  readonly selectedFile: CommittedFileChange | null
  readonly currentDiff: IDiff | null
  readonly commitSummaryWidth: number
  readonly gitHubUsers: Map<string, IGitHubUser>
  readonly selectedDiffType: ImageDiffType
  /** The name of the currently selected external editor */
  readonly externalEditorLabel?: string

  /**
   * Called to open a file using the user's configured applications
   * @param path The path of the file relative to the root of the repository
   */
  readonly onOpenInExternalEditor: (path: string) => void
}

interface ISelectedCommitState {
  readonly isExpanded: boolean
  readonly hideDescriptionBorder: boolean
}

/** The History component. Contains the commit list, commit summary, and diff. */
export class SelectedCommit extends React.Component<
  ISelectedCommitProps,
  ISelectedCommitState
> {
  private readonly loadChangedFilesScheduler = new ThrottledScheduler(200)
  private historyRef: HTMLDivElement | null = null

  public constructor(props: ISelectedCommitProps) {
    super(props)

    this.state = {
      isExpanded: false,
      hideDescriptionBorder: false,
    }
  }

  private onFileSelected = (file: CommittedFileChange) => {
    this.props.dispatcher.changeFileSelection(this.props.repository, file)
  }

  private onHistoryRef = (ref: HTMLDivElement | null) => {
    this.historyRef = ref
  }

  public componentWillUpdate(nextProps: ISelectedCommitProps) {
    // reset isExpanded if we're switching commits.
    const currentValue = this.props.selectedCommit
      ? this.props.selectedCommit.sha
      : undefined
    const nextValue = nextProps.selectedCommit
      ? nextProps.selectedCommit.sha
      : undefined

    if ((currentValue || nextValue) && currentValue !== nextValue) {
      if (this.state.isExpanded) {
        this.setState({ isExpanded: false })
      }
    }
  }

  public componentWillUnmount() {
    this.loadChangedFilesScheduler.clear()
  }

  private renderDiff() {
    const file = this.props.selectedFile
    const diff = this.props.currentDiff

    if (file == null || diff == null) {
      // don't show both 'empty' messages
      const message =
        this.props.changedFiles.length === 0 ? '' : 'No file selected'

      return (
        <div className="panel blankslate" id="diff">
          {message}
        </div>
      )
    }

    return (
      <Diff
        repository={this.props.repository}
        imageDiffType={this.props.selectedDiffType}
        file={file}
        diff={diff}
        readOnly={true}
        dispatcher={this.props.dispatcher}
      />
    )
  }

  private renderCommitSummary(commit: Commit) {
    return (
      <CommitSummary
        commit={commit}
        files={this.props.changedFiles}
        emoji={this.props.emoji}
        repository={this.props.repository}
        gitHubUsers={this.props.gitHubUsers}
        onExpandChanged={this.onExpandChanged}
        isExpanded={this.state.isExpanded}
        onDescriptionBottomChanged={this.onDescriptionBottomChanged}
        hideDescriptionBorder={this.state.hideDescriptionBorder}
      />
    )
  }

  private onExpandChanged = (isExpanded: boolean) => {
    this.setState({ isExpanded })
  }

  private onDescriptionBottomChanged = (descriptionBottom: Number) => {
    if (this.historyRef) {
      const historyBottom = this.historyRef.getBoundingClientRect().bottom
      this.setState({
        hideDescriptionBorder: descriptionBottom >= historyBottom,
      })
    }
  }

  private onCommitSummaryReset = () => {
    this.props.dispatcher.resetCommitSummaryWidth()
  }

  private onCommitSummaryResize = (width: number) => {
    this.props.dispatcher.setCommitSummaryWidth(width)
  }

  private renderFileList() {
    const files = this.props.changedFiles
    if (files.length === 0) {
      return <div className="fill-window">No files in commit</div>
    }

    // -1 for right hand side border
    const availableWidth = this.props.commitSummaryWidth - 1

    return (
      <FileList<CommittedFileChange>
        files={files}
        onSelectedFileChanged={this.onFileSelected}
        selectedFile={this.props.selectedFile}
        availableWidth={availableWidth}
        onOpenItem={this.onOpenItem}
        externalEditorLabel={this.props.externalEditorLabel}
        onOpenInExternalEditor={this.props.onOpenInExternalEditor}
        repository={this.props.repository}
      />
    )
  }

  /**
   * Open file with default application.
   * @param path The path of the file relative to the root of the repository
   */
  private onOpenItem = (path: string) => {
    const fullPath = Path.join(this.props.repository.path, path)
    openFile(fullPath, this.props.dispatcher)
  }

  public render() {
    const commit = this.props.selectedCommit

    if (commit == null) {
      return <NoCommitSelected />
    }

    const className = this.state.isExpanded ? 'expanded' : 'collapsed'

    return (
      <div id="history" ref={this.onHistoryRef} className={className}>
        {this.renderCommitSummary(commit)}
        <div id="commit-details">
          <Resizable
            width={this.props.commitSummaryWidth}
            onResize={this.onCommitSummaryResize}
            onReset={this.onCommitSummaryReset}
          >
            {this.renderFileList()}
          </Resizable>
          {this.renderDiff()}
        </div>
      </div>
    )
  }
}

function NoCommitSelected() {
  const BlankSlateImage = encodePathAsUrl(
    __dirname,
    'static/empty-no-commit.svg'
  )

  return (
    <div className="panel blankslate">
      <img src={BlankSlateImage} className="blankslate-image" />
      No commit selected
    </div>
  )
}
