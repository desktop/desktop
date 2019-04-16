import * as React from 'react'
import * as Path from 'path'
import { pathExists } from 'fs-extra'
import { revealInFileManager } from '../../lib/app-shell'

import { CommittedFileChange } from '../../models/status'
import { Repository } from '../../models/repository'

import { PathLabel } from '../lib/path-label'
import {
  isSafeFileExtension,
  CopyFilePathLabel,
  DefaultEditorLabel,
  RevealInFileManagerLabel,
  OpenWithDefaultProgramLabel,
} from '../lib/context-menu'
import { List } from '../lib/list'

import { Octicon, iconForStatus } from '../octicons'
import { showContextualMenu } from '../main-process-proxy'
import { clipboard } from 'electron'
import { mapStatus } from '../../lib/status'

interface IFileListProps {
  readonly files: ReadonlyArray<CommittedFileChange>
  readonly selectedFile: CommittedFileChange | null
  readonly onSelectedFileChanged: (file: CommittedFileChange) => void
  readonly availableWidth: number

  /**
   * Called to open a file with its default application
   * @param path The path of the file relative to the root of the repository
   */
  readonly onOpenItem: (path: string) => void

  /** The name of the currently selected external editor */
  readonly externalEditorLabel?: string

  /**
   * Called to open a file using the user's configured applications
   * @param path The path of the file relative to the root of the repository
   */
  readonly onOpenInExternalEditor: (path: string) => void

  /**
   * Repository that we use to get the base path and build
   * full path for the file in commit to check for file existence
   */
  readonly repository: Repository
}

/**
 * Display a list of changed files as part of a commit or stash
 */
export class FileList extends React.Component<IFileListProps> {
  private onSelectedRowChanged = (row: number) => {
    const file = this.props.files[row]
    this.props.onSelectedFileChanged(file)
  }

  private renderFile = (row: number) => {
    const file = this.props.files[row]
    const status = file.status
    const fileStatus = mapStatus(status)

    const listItemPadding = 10 * 2
    const statusWidth = 16
    const filePathPadding = 5
    const availablePathWidth =
      this.props.availableWidth -
      listItemPadding -
      filePathPadding -
      statusWidth

    return (
      <div className="file" onContextMenu={this.onContextMenu}>
        <PathLabel
          path={file.path}
          status={file.status}
          availableWidth={availablePathWidth}
        />

        <Octicon
          symbol={iconForStatus(status)}
          className={'status status-' + fileStatus.toLowerCase()}
          title={fileStatus}
        />
      </div>
    )
  }

  private rowForFile(file: CommittedFileChange | null): number {
    return file ? this.props.files.findIndex(f => f.path === file.path) : -1
  }

  public render() {
    return (
      <div className="file-list">
        <List
          rowRenderer={this.renderFile}
          rowCount={this.props.files.length}
          rowHeight={29}
          selectedRows={[this.rowForFile(this.props.selectedFile)]}
          onSelectedRowChanged={this.onSelectedRowChanged}
        />
      </div>
    )
  }

  private onContextMenu = async (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()

    if (this.props.selectedFile == null) {
      return
    }

    const filePath = this.props.selectedFile.path
    const fullPath = Path.join(this.props.repository.path, filePath)
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

    const extension = Path.extname(filePath)

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
        action: () => revealInFileManager(this.props.repository, filePath),
        enabled: fileExistsOnDisk,
      },
      {
        label: openInExternalEditor,
        action: () => this.props.onOpenInExternalEditor(fullPath),
        enabled: isSafeExtension && fileExistsOnDisk,
      },
      {
        label: OpenWithDefaultProgramLabel,
        action: () => this.props.onOpenItem(filePath),
        enabled: isSafeExtension && fileExistsOnDisk,
      },
    ]
    showContextualMenu(items)
  }
}
