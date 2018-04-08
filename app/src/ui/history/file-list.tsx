import * as React from 'react'
import * as Path from 'path'
import { pathExists } from '../../lib/file-system'

import { FileChange, mapStatus, iconForStatus } from '../../models/status'
import { PathLabel } from '../lib/path-label'
import { Octicon } from '../octicons'
import { List } from '../lib/list'
import { showContextualMenu } from '../main-process-proxy'
import { IMenuItem } from '../../lib/menu-item'
import { Repository } from '../../models/repository'

const RestrictedFileExtensions = ['.cmd', '.exe', '.bat', '.sh']
const defaultEditorLabel = __DARWIN__
  ? 'Open in External Editor'
  : 'Open in external editor'

interface IFileListProps {
  readonly files: ReadonlyArray<FileChange>
  readonly selectedFile: FileChange | null
  readonly onSelectedFileChanged: (file: FileChange) => void
  readonly availableWidth: number
  /**
   * Called to reveal a file in the native file manager.
   * @param path The path of the file relative to the root of the repository
   */
  readonly onRevealInFileManager: (path: string) => void

  /**
   * Called to open a file it its default application
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

export class FileList extends React.Component<IFileListProps, {}> {
  private onSelectionChanged = (row: number) => {
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
          oldPath={file.oldPath}
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

  private rowForFile(file: FileChange | null): number {
    return file ? this.props.files.findIndex(f => f.path === file.path) : -1
  }

  public render() {
    return (
      <div className="file-list">
        <List
          rowRenderer={this.renderFile}
          rowCount={this.props.files.length}
          rowHeight={29}
          selectedRow={this.rowForFile(this.props.selectedFile)}
          onSelectionChanged={this.onSelectionChanged}
        />
      </div>
    )
  }

  private onContextMenu = async (event: React.MouseEvent<any>) => {
    event.preventDefault()

    if (this.props.selectedFile !== null) {
      const filePath = this.props.selectedFile.path
      const fullPath = Path.join(this.props.repository.path, filePath)
      const fileExistsOnDisk = await pathExists(fullPath)
      const extension = Path.extname(filePath)
      const items: IMenuItem[] = []

      const isSafeExtension = __WIN32__
        ? RestrictedFileExtensions.indexOf(extension.toLowerCase()) === -1
        : true

      const revealInFileManagerLabel = __DARWIN__
        ? 'Reveal in Finder'
        : __WIN32__ ? 'Show in Explorer' : 'Show in your File Manager'

      const openInExternalEditor = this.props.externalEditorLabel
        ? `Open in ${this.props.externalEditorLabel}`
        : defaultEditorLabel

      items.push(
        {
          label: revealInFileManagerLabel,
          action: () => this.props.onRevealInFileManager(filePath),
          enabled: fileExistsOnDisk,
        },
        {
          label: openInExternalEditor,
          action: () => this.props.onOpenInExternalEditor(fullPath),
          enabled: isSafeExtension && fileExistsOnDisk,
        },
        {
          label: __DARWIN__
            ? 'Open with Default Program'
            : 'Open with default program',
          action: () => this.props.onOpenItem(fullPath),
          enabled: isSafeExtension && fileExistsOnDisk,
        }
      )
      showContextualMenu(items)
    }
  }
}
