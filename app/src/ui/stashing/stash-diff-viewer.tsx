import * as React from 'react'
import { IStashEntry, StashedChangesLoadStates } from '../../models/stash-entry'
import { FileList } from '../history/file-list'
import { Dispatcher } from '../dispatcher'
import { CommittedFileChange } from '../../models/status'
import { Repository } from '../../models/repository'
import { IDiff, ImageDiffType } from '../../models/diff'
import { Resizable } from '../resizable'
import { StashDiffHeader } from './stash-diff-header'
import { SeamlessDiffSwitcher } from '../diff/seamless-diff-switcher'
import { IConstrainedValue } from '../../lib/app-state'
import { clamp } from '../../lib/clamp'

interface IStashDiffViewerProps {
  /** The stash in question. */
  readonly stashEntry: IStashEntry

  /** Currently selected file in the list */
  readonly selectedStashedFile: CommittedFileChange | null

  /** Diff to be displayed */
  readonly stashedFileDiff: IDiff | null
  readonly imageDiffType: ImageDiffType

  /** width to use for the files list pane */
  readonly fileListWidth: IConstrainedValue
  readonly repository: Repository
  readonly dispatcher: Dispatcher

  /** Should the app propt the user to confirm a discard stash */
  readonly askForConfirmationOnDiscardStash: boolean

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

  /** Called when the user changes the hide whitespace in diffs setting. */
  readonly onHideWhitespaceInDiffChanged: (checked: boolean) => void

  /** Called when the user requests to open a submodule. */
  readonly onOpenSubmodule: (fullPath: string) => void

  /**
   * Called to open a file using the user's configured applications
   *
   * @param path The path of the file relative to the root of the repository
   */
  readonly onOpenInExternalEditor: (path: string) => void
}

/// Id of the stash diff viewer
export const StashDiffViewerId = 'stash-diff-viewer'

/**
 * Component to display a selected stash's file list and diffs
 *
 * _(Like viewing a selected commit in history but for a stash)_
 */
export class StashDiffViewer extends React.PureComponent<IStashDiffViewerProps> {
  private onSelectedFileChanged = (file: CommittedFileChange) =>
    this.props.dispatcher.selectStashedFile(this.props.repository, file)

  private onRowDoubleClick = (row: number) => {
    const files = this.getFiles()
    const file = files[row]

    this.props.onOpenInExternalEditor(file.path)
  }

  private onResize = (width: number) =>
    this.props.dispatcher.setStashedFilesWidth(width)

  private onReset = () => this.props.dispatcher.resetStashedFilesWidth()

  private getFiles = () =>
    this.props.stashEntry.files.kind === StashedChangesLoadStates.Loaded
      ? this.props.stashEntry.files.files
      : new Array<CommittedFileChange>()

  public render() {
    const {
      stashEntry,
      selectedStashedFile,
      stashedFileDiff,
      repository,
      dispatcher,
      imageDiffType,
      fileListWidth,
      onOpenBinaryFile,
      onChangeImageDiffType,
      onOpenSubmodule,
    } = this.props
    const files = this.getFiles()

    const diffComponent =
      selectedStashedFile !== null ? (
        <SeamlessDiffSwitcher
          repository={repository}
          readOnly={true}
          file={selectedStashedFile}
          diff={stashedFileDiff}
          imageDiffType={imageDiffType}
          hideWhitespaceInDiff={false}
          showDiffCheckMarks={false}
          showSideBySideDiff={this.props.showSideBySideDiff}
          onOpenBinaryFile={onOpenBinaryFile}
          onChangeImageDiffType={onChangeImageDiffType}
          onHideWhitespaceInDiffChanged={
            this.props.onHideWhitespaceInDiffChanged
          }
          onOpenSubmodule={onOpenSubmodule}
        />
      ) : null

    const availableWidth = clamp(fileListWidth)

    return (
      <section id={StashDiffViewerId}>
        <StashDiffHeader
          stashEntry={stashEntry}
          repository={repository}
          dispatcher={dispatcher}
          askForConfirmationOnDiscardStash={
            this.props.askForConfirmationOnDiscardStash
          }
        />
        <div className="commit-details">
          <Resizable
            width={fileListWidth.value}
            minimumWidth={fileListWidth.min}
            maximumWidth={fileListWidth.max}
            onResize={this.onResize}
            onReset={this.onReset}
          >
            <FileList
              files={files}
              onSelectedFileChanged={this.onSelectedFileChanged}
              selectedFile={selectedStashedFile}
              availableWidth={availableWidth}
              onRowDoubleClick={this.onRowDoubleClick}
            />
          </Resizable>
          {diffComponent}
        </div>
      </section>
    )
  }
}
