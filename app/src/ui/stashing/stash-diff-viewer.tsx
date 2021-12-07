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

  /** Whether we should display side by side diffs. */
  readonly showSideBySideDiff: boolean

  /** Are there any uncommitted changes */
  readonly isWorkingTreeClean: boolean

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
}

/**
 * Component to display a selected stash's file list and diffs
 *
 * _(Like viewing a selected commit in history but for a stash)_
 */
export class StashDiffViewer extends React.PureComponent<
  IStashDiffViewerProps
> {
  private onSelectedFileChanged = (file: CommittedFileChange) =>
    this.props.dispatcher.selectStashedFile(this.props.repository, file)

  private onResize = (width: number) =>
    this.props.dispatcher.setStashedFilesWidth(width)

  private onReset = () => this.props.dispatcher.resetStashedFilesWidth()

  public render() {
    const {
      stashEntry,
      selectedStashedFile,
      stashedFileDiff,
      repository,
      dispatcher,
      imageDiffType,
      isWorkingTreeClean,
      fileListWidth,
      onOpenBinaryFile,
      onChangeImageDiffType,
    } = this.props
    const files =
      stashEntry.files.kind === StashedChangesLoadStates.Loaded
        ? stashEntry.files.files
        : new Array<CommittedFileChange>()

    const diffComponent =
      selectedStashedFile !== null ? (
        <SeamlessDiffSwitcher
          repository={repository}
          readOnly={true}
          file={selectedStashedFile}
          diff={stashedFileDiff}
          imageDiffType={imageDiffType}
          hideWhitespaceInDiff={false}
          showSideBySideDiff={this.props.showSideBySideDiff}
          onOpenBinaryFile={onOpenBinaryFile}
          onChangeImageDiffType={onChangeImageDiffType}
          onHideWhitespaceInDiffChanged={
            this.props.onHideWhitespaceInDiffChanged
          }
        />
      ) : null

    const availableWidth = clamp(fileListWidth)

    return (
      <section id="stash-diff-viewer">
        <StashDiffHeader
          stashEntry={stashEntry}
          repository={repository}
          dispatcher={dispatcher}
          isWorkingTreeClean={isWorkingTreeClean}
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
            />
          </Resizable>
          {diffComponent}
        </div>
      </section>
    )
  }
}
