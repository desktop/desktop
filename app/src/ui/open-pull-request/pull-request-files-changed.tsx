import * as React from 'react'
import * as Path from 'path'
import { IDiff, ImageDiffType } from '../../models/diff'
import { Repository } from '../../models/repository'
import { CommittedFileChange } from '../../models/status'
import { SeamlessDiffSwitcher } from '../diff/seamless-diff-switcher'
import { Dispatcher } from '../dispatcher'
import { openFile } from '../lib/open-file'
import { Resizable } from '../resizable'
import { FileList } from '../history/file-list'
import { IMenuItem, showContextualMenu } from '../../lib/menu-item'
import { pathExists } from '../lib/path-exists'
import {
  CopyFilePathLabel,
  CopyRelativeFilePathLabel,
  DefaultEditorLabel,
  isSafeFileExtension,
  OpenWithDefaultProgramLabel,
  RevealInFileManagerLabel,
} from '../lib/context-menu'
import { revealInFileManager } from '../../lib/app-shell'
import { clipboard } from 'electron'
import { IConstrainedValue } from '../../lib/app-state'
import { clamp } from '../../lib/clamp'

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

  /** Label for selected external editor */
  readonly externalEditorLabel?: string

  /** Width to use for the files list pane */
  readonly fileListWidth: IConstrainedValue
}

/**
 * A component for viewing the file diff for a pull request.
 */
export class PullRequestFilesChanged extends React.Component<
  IPullRequestFilesChangedProps,
  {}
> {
  private onOpenFile = (path: string) => {
    const fullPath = Path.join(this.props.repository.path, path)
    this.onOpenBinaryFile(fullPath)
  }

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

  private onFileListResize = (width: number) => {
    this.props.dispatcher.setPullRequestFileListWidth(width)
  }

  private onFileListSizeReset = () => {
    this.props.dispatcher.resetPullRequestFileListWidth()
  }

  private onFileContextMenu = async (
    file: CommittedFileChange,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    event.preventDefault()

    const { repository } = this.props

    const fullPath = Path.join(repository.path, file.path)
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

    const { externalEditorLabel, dispatcher } = this.props

    const extension = Path.extname(file.path)
    const isSafeExtension = isSafeFileExtension(extension)
    const openInExternalEditor =
      externalEditorLabel !== undefined
        ? `Open in ${externalEditorLabel}`
        : DefaultEditorLabel

    const items: IMenuItem[] = [
      {
        label: RevealInFileManagerLabel,
        action: () => revealInFileManager(repository, file.path),
        enabled: fileExistsOnDisk,
      },
      {
        label: openInExternalEditor,
        action: () => dispatcher.openInExternalEditor(fullPath),
        enabled: fileExistsOnDisk,
      },
      {
        label: OpenWithDefaultProgramLabel,
        action: () => this.onOpenFile(file.path),
        enabled: isSafeExtension && fileExistsOnDisk,
      },
      { type: 'separator' },
      {
        label: CopyFilePathLabel,
        action: () => clipboard.writeText(fullPath),
      },
      {
        label: CopyRelativeFilePathLabel,
        action: () => clipboard.writeText(Path.normalize(file.path)),
      },
      { type: 'separator' },
    ]

    showContextualMenu(items)
  }

  private onFileSelected = (file: CommittedFileChange) => {
    this.props.dispatcher.changePullRequestFileSelection(
      this.props.repository,
      file
    )
  }

  private renderFileList() {
    const { files, selectedFile, fileListWidth } = this.props

    return (
      <Resizable
        width={fileListWidth.value}
        minimumWidth={fileListWidth.min}
        maximumWidth={fileListWidth.max}
        onResize={this.onFileListResize}
        onReset={this.onFileListSizeReset}
      >
        <FileList
          files={files}
          onSelectedFileChanged={this.onFileSelected}
          selectedFile={selectedFile}
          availableWidth={clamp(fileListWidth)}
          onContextMenu={this.onFileContextMenu}
        />
      </Resizable>
    )
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

  public render() {
    // TODO: handle empty change set
    return (
      <div className="pull-request-diff-viewer">
        {this.renderHeader()}
        {this.renderFileList()}
        {this.renderDiff()}
      </div>
    )
  }
}
