import * as React from 'react'

import { CommittedFileChange } from '../../models/status'
import { List } from '../lib/list'
import { CommittedFileItem } from './committed-file-item'

interface IFileListProps {
  readonly files: ReadonlyArray<CommittedFileChange>
  readonly selectedFile: CommittedFileChange | null
  readonly onSelectedFileChanged: (file: CommittedFileChange) => void
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
  private onSelectedRowChanged = (row: number) => {
    const file = this.props.files[row]
    this.props.onSelectedFileChanged(file)
  }

  private renderFile = (row: number) => {
    return (
      <CommittedFileItem
        file={this.props.files[row]}
        availableWidth={this.props.availableWidth}
        onContextMenu={this.props.onContextMenu}
      />
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
