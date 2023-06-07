import * as React from 'react'

import { CommittedFileChange } from '../../models/status'
import { ClickSource, List } from '../lib/list'
import {
  InvalidRowIndexPath,
  RowIndexPath,
} from '../lib/list/list-row-index-path'
import { CommittedFileItem } from './committed-file-item'

interface IFileListProps {
  readonly files: ReadonlyArray<CommittedFileChange>
  readonly selectedFile: CommittedFileChange | null
  readonly onSelectedFileChanged: (file: CommittedFileChange) => void
  readonly onRowDoubleClick: (row: number, source: ClickSource) => void
  readonly availableWidth: number
  readonly onContextMenu?: (
    file: CommittedFileChange,
    event: React.MouseEvent<HTMLDivElement>
  ) => void
}

/**
 * Display a list of changed files as part of a commit or stash
 */
export class FileList extends React.Component<IFileListProps> {
  private onSelectedRowChanged = (indexPath: RowIndexPath) => {
    const file = this.props.files[indexPath.row]
    this.props.onSelectedFileChanged(file)
  }

  private onRowDoubleClick = (indexPath: RowIndexPath, source: ClickSource) => {
    this.props.onRowDoubleClick(indexPath.row, source)
  }

  private renderFile = (indexPath: RowIndexPath) => {
    return (
      <CommittedFileItem
        file={this.props.files[indexPath.row]}
        availableWidth={this.props.availableWidth}
        onContextMenu={this.props.onContextMenu}
      />
    )
  }

  private rowForFile(file: CommittedFileChange | null): RowIndexPath {
    return file
      ? {
          section: 0,
          row: this.props.files.findIndex(f => f.path === file.path),
        }
      : InvalidRowIndexPath
  }

  public render() {
    const { selectedFile, files } = this.props
    return (
      <div className="file-list">
        <List
          rowRenderer={this.renderFile}
          rowCount={[files.length]}
          rowHeight={29}
          selectedRows={[this.rowForFile(selectedFile)]}
          onSelectedRowChanged={this.onSelectedRowChanged}
          onRowDoubleClick={this.onRowDoubleClick}
        />
      </div>
    )
  }
}
