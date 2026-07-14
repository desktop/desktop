import * as React from 'react'
import { mapStatus } from '../../lib/status'

import { CommittedFileChange } from '../../models/status'
import { ClickSource, List } from '../lib/list'
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

interface IFileListState {
  readonly focusedRow: number | null
}

/**
 * Display a list of changed files as part of a commit or stash
 */
export class FileList extends React.Component<IFileListProps, IFileListState> {
  public constructor(props: IFileListProps) {
    super(props)

    this.state = {
      focusedRow: null,
    }
  }

  private onSelectedRowChanged = (row: number) => {
    const file = this.props.files[row]
    this.props.onSelectedFileChanged(file)
  }

  private renderFile = (row: number) => {
    return (
      <CommittedFileItem
        file={this.props.files[row]}
        availableWidth={this.props.availableWidth}
        focused={this.state.focusedRow === row}
      />
    )
  }

  private selectedRowsForFile(): ReadonlyArray<number> {
    const { selectedFile: file, files } = this.props
    const fileIndex = file ? files.findIndex(f => f.path === file.path) : -1
    return fileIndex >= 0 ? [fileIndex] : []
  }

  private onRowContextMenu = (
    row: number,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    this.props.onContextMenu?.(this.props.files[row], event)
  }

  private getFileAriaLabel = (row: number) => {
    const file = this.props.files[row]
    const { path, status } = file
    const fileStatus = mapStatus(status)
    return `${path} ${fileStatus}`
  }

  public render() {
    return (
      <div className="file-list">
        <List
          rowRenderer={this.renderFile}
          rowCount={this.props.files.length}
          rowHeight={29}
          selectedRows={this.selectedRowsForFile()}
          onSelectedRowChanged={this.onSelectedRowChanged}
          onRowDoubleClick={this.props.onRowDoubleClick}
          onRowContextMenu={this.onRowContextMenu}
          onRowKeyboardFocus={this.onRowFocus}
          onRowBlur={this.onRowBlur}
          getRowAriaLabel={this.getFileAriaLabel}
          invalidationProps={{ focusedRow: this.state.focusedRow }}
        />
      </div>
    )
  }

  private onRowFocus = (row: number) => {
    this.setState({ focusedRow: row })
  }

  private onRowBlur = (row: number) => {
    if (this.state.focusedRow === row) {
      this.setState({ focusedRow: null })
    }
  }
}
