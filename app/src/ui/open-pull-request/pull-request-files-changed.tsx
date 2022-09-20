import * as React from 'react'
import { IDiff, ImageDiffType } from '../../models/diff'
import { Repository } from '../../models/repository'
import { CommittedFileChange } from '../../models/status'
import { SeamlessDiffSwitcher } from '../diff/seamless-diff-switcher'
import { Dispatcher } from '../dispatcher'
import { openFile } from '../lib/open-file'
import { Resizable } from '../resizable'
import { FileList } from '../history/file-list'

interface IPullRequestFilesChangedProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher

  /** The file whose diff should be displayed. */
  readonly selectedFile: CommittedFileChange | null

  /** The files changed in the pull request. */
  readonly files: ReadonlyArray<CommittedFileChange>

  /** The diff that should be rendered */
  readonly diff: IDiff | null

  /** The type of image diff to display. */
  readonly imageDiffType: ImageDiffType

  /** Whether we should display side by side diffs. */
  readonly showSideBySideDiff: boolean

  /** Whether we should hide whitespace in diff. */
  readonly hideWhitespaceInDiff: boolean
}

/**
 * A component for viewing the file diff for a pull request.
 */
export class PullRequestFilesChanged extends React.Component<
  IPullRequestFilesChangedProps,
  {}
> {
  /**
   * Opens a binary file in an the system-assigned application for
   * said file type.
   */
  private onOpenBinaryFile = (fullPath: string) => {
    openFile(fullPath, this.props.dispatcher)
  }

  /** Called when the user changes the hide whitespace in diffs setting. */
  private onHideWhitespaceInDiffChanged = (hideWhitespaceInDiff: boolean) => {
    const { selectedFile } = this.props
    return this.props.dispatcher.onHideWhitespaceInHistoryDiffChanged(
      hideWhitespaceInDiff,
      this.props.repository,
      selectedFile as CommittedFileChange
    )
  }

  /**
   * Called when the user is viewing an image diff and requests
   * to change the diff presentation mode.
   */
  private onChangeImageDiffType = (imageDiffType: ImageDiffType) => {
    this.props.dispatcher.changeImageDiffType(imageDiffType)
  }

  private renderDiff() {
    const { selectedFile } = this.props

    if (selectedFile === null) {
      return
    }

    const {
      diff,
      repository,
      imageDiffType,
      hideWhitespaceInDiff,
      showSideBySideDiff,
    } = this.props

    return (
      <SeamlessDiffSwitcher
        repository={repository}
        imageDiffType={imageDiffType}
        file={selectedFile}
        diff={diff}
        readOnly={true}
        hideWhitespaceInDiff={hideWhitespaceInDiff}
        showSideBySideDiff={showSideBySideDiff}
        onOpenBinaryFile={this.onOpenBinaryFile}
        onChangeImageDiffType={this.onChangeImageDiffType}
        onHideWhitespaceInDiffChanged={this.onHideWhitespaceInDiffChanged}
      />
    )
  }

  private onDiffResize(newWidth: number) {}

  private onDiffSizeReset() {}

  private onContextMenu() {}

  private onFileSelected = (file: CommittedFileChange) => {
    this.props.dispatcher.changePullRequestFileSelection(
      this.props.repository,
      file
    )
  }

  private renderFileList() {
    const { files, selectedFile } = this.props

    return (
      <Resizable
        width={200}
        minimumWidth={100}
        maximumWidth={300}
        onResize={this.onDiffResize}
        onReset={this.onDiffSizeReset}
      >
        <FileList
          files={files}
          onSelectedFileChanged={this.onFileSelected}
          selectedFile={selectedFile}
          availableWidth={400}
          onContextMenu={this.onContextMenu}
        />
      </Resizable>
    )
  }

  public render() {
    // TODO: handle empty change set
    return (
      <div className="pull-request-diff-viewer">
        {this.renderFileList()}
        {this.renderDiff()}
      </div>
    )
  }
}
