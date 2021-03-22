import * as React from 'react'
import { clipboard } from 'electron'
import { pathExists } from 'fs-extra'
import * as Path from 'path'

import { Repository } from '../../models/repository'
import { CommittedFileChange } from '../../models/status'
import { Commit } from '../../models/commit'
import { IDiff, ImageDiffType } from '../../models/diff'

import { encodePathAsUrl } from '../../lib/path'
import { revealInFileManager } from '../../lib/app-shell'

import { openFile } from '../lib/open-file'
import {
  isSafeFileExtension,
  CopyFilePathLabel,
  DefaultEditorLabel,
  RevealInFileManagerLabel,
  OpenWithDefaultProgramLabel,
} from '../lib/context-menu'
import { ThrottledScheduler } from '../lib/throttled-scheduler'

import { Dispatcher } from '../dispatcher'
import { Resizable } from '../resizable'
import { showContextualMenu } from '../main-process-proxy'

import { CommitSummary } from './commit-summary'
import { FileList } from './file-list'
import { SeamlessDiffSwitcher } from '../diff/seamless-diff-switcher'
import { DragOverlay } from '../drag-overlay'

interface ISelectedCommitProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly emoji: Map<string, string>
  readonly selectedCommit: Commit | null
  readonly changedFiles: ReadonlyArray<CommittedFileChange>
  readonly selectedFile: CommittedFileChange | null
  readonly currentDiff: IDiff | null
  readonly commitSummaryWidth: number
  readonly selectedDiffType: ImageDiffType
  /** The name of the currently selected external editor */
  readonly externalEditorLabel?: string

  /**
   * Called to open a file using the user's configured applications
   *
   * @param path The path of the file relative to the root of the repository
   */
  readonly onOpenInExternalEditor: (path: string) => void
  readonly hideWhitespaceInDiff: boolean

  /** Whether we should display side by side diffs. */
  readonly showSideBySideDiff: boolean

  /**
   * Called when the user requests to open a binary file in an the
   * system-assigned application for said file type.
   */
  readonly onOpenBinaryFile: (fullPath: string) => void

  /**
   * Called when the user is viewing an image diff and requests
   * to change the diff presentation mode.
   */
  readonly onChangeImageDiffType: (type: ImageDiffType) => void

  /** Called when the user opens the diff options popover */
  readonly onDiffOptionsOpened: () => void

  /** Whether multiple commits are selected. */
  readonly areMultipleCommitsSelected: boolean

  /** Whether or not to show the drag overlay */
  readonly showDragOverlay: boolean
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

    if (file == null) {
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
      <SeamlessDiffSwitcher
        repository={this.props.repository}
        imageDiffType={this.props.selectedDiffType}
        file={file}
        diff={diff}
        readOnly={true}
        hideWhitespaceInDiff={this.props.hideWhitespaceInDiff}
        showSideBySideDiff={this.props.showSideBySideDiff}
        onOpenBinaryFile={this.props.onOpenBinaryFile}
        onChangeImageDiffType={this.props.onChangeImageDiffType}
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
        onExpandChanged={this.onExpandChanged}
        isExpanded={this.state.isExpanded}
        onDescriptionBottomChanged={this.onDescriptionBottomChanged}
        hideDescriptionBorder={this.state.hideDescriptionBorder}
        hideWhitespaceInDiff={this.props.hideWhitespaceInDiff}
        showSideBySideDiff={this.props.showSideBySideDiff}
        onHideWhitespaceInDiffChanged={this.onHideWhitespaceInDiffChanged}
        onShowSideBySideDiffChanged={this.onShowSideBySideDiffChanged}
        onDiffOptionsOpened={this.props.onDiffOptionsOpened}
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

  private onHideWhitespaceInDiffChanged = async (
    hideWhitespaceInDiff: boolean
  ) => {
    await this.props.dispatcher.onHideWhitespaceInDiffChanged(
      hideWhitespaceInDiff,
      this.props.repository,
      this.props.selectedFile as CommittedFileChange
    )
  }

  private onShowSideBySideDiffChanged = (showSideBySideDiff: boolean) => {
    this.props.dispatcher.onShowSideBySideDiffChanged(showSideBySideDiff)
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
      <FileList
        files={files}
        onSelectedFileChanged={this.onFileSelected}
        selectedFile={this.props.selectedFile}
        availableWidth={availableWidth}
        onContextMenu={this.onContextMenu}
      />
    )
  }

  /**
   * Open file with default application.
   *
   * @param path The path of the file relative to the root of the repository
   */
  private onOpenItem = (path: string) => {
    const fullPath = Path.join(this.props.repository.path, path)
    openFile(fullPath, this.props.dispatcher)
  }

  public render() {
    const commit = this.props.selectedCommit

    if (this.props.areMultipleCommitsSelected) {
      return this.renderMultipleCommitsSelected()
    }

    if (commit == null) {
      return <NoCommitSelected />
    }

    const className = this.state.isExpanded ? 'expanded' : 'collapsed'

    return (
      <div id="history" ref={this.onHistoryRef} className={className}>
        {this.renderCommitSummary(commit)}
        <div className="commit-details">
          <Resizable
            width={this.props.commitSummaryWidth}
            onResize={this.onCommitSummaryResize}
            onReset={this.onCommitSummaryReset}
          >
            {this.renderFileList()}
          </Resizable>
          {this.renderDiff()}
        </div>
        {this.renderDragOverlay()}
      </div>
    )
  }

  private renderDragOverlay(): JSX.Element | null {
    if (!this.props.showDragOverlay) {
      return null
    }

    return <DragOverlay dragZoneDescription="branch-button" />
  }

  private renderMultipleCommitsSelected(): JSX.Element {
    const BlankSlateImage = encodePathAsUrl(
      __dirname,
      'static/empty-no-commit.svg'
    )

    return (
      <div id="multiple-commits-selected" className="blankslate">
        <div className="panel blankslate">
          <img src={BlankSlateImage} className="blankslate-image" />
          <div>
            <p>Unable to display diff when multiple commits are selected.</p>
            <div>You can:</div>
            <ul>
              <li>Select a single commit to view a diff.</li>
              <li>Drag the commits to the branch menu to cherry-pick them.</li>
              <li>Right click on multiple commits to see options.</li>
            </ul>
          </div>
        </div>
        {this.renderDragOverlay()}
      </div>
    )
  }

  private onContextMenu = async (
    file: CommittedFileChange,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    event.preventDefault()

    const fullPath = Path.join(this.props.repository.path, file.path)
    const fileExistsOnDisk = await pathExists(fullPath)
    if (!fileExistsOnDisk) {
      showContextualMenu([
        {
          label: __DARWIN__
            ? 'File Does Not Exist on Disk'
            : 'File does not exist on disk',
          enabled: false,
        },
      ])
      return
    }

    const extension = Path.extname(file.path)

    const isSafeExtension = isSafeFileExtension(extension)
    const openInExternalEditor = this.props.externalEditorLabel
      ? `Open in ${this.props.externalEditorLabel}`
      : DefaultEditorLabel

    const items = [
      {
        label: CopyFilePathLabel,
        action: () => clipboard.writeText(fullPath),
      },
      {
        label: RevealInFileManagerLabel,
        action: () => revealInFileManager(this.props.repository, file.path),
        enabled: fileExistsOnDisk,
      },
      {
        label: openInExternalEditor,
        action: () => this.props.onOpenInExternalEditor(fullPath),
        enabled: isSafeExtension && fileExistsOnDisk,
      },
      {
        label: OpenWithDefaultProgramLabel,
        action: () => this.onOpenItem(file.path),
        enabled: isSafeExtension && fileExistsOnDisk,
      },
    ]
    showContextualMenu(items)
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
