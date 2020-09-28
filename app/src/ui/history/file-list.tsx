import * as React from 'react'

import { CommittedFileChange } from '../../models/status'

import { PathLabel } from '../lib/path-label'
import { List } from '../lib/list'

import { Octicon, iconForStatus } from '../octicons'
import { mapStatus } from '../../lib/status'

interface IFileListProps {
  readonly files: ReadonlyArray<CommittedFileChange>
  readonly selectedFile: CommittedFileChange | null
  readonly onSelectedFileChanged: (file: CommittedFileChange) => void
  readonly availableWidth: number
  readonly onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void
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
      <div className="file" onContextMenu={this.props.onContextMenu}>
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
}
