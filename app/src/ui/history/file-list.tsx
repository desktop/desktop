import * as React from 'react'
import { FileChange, mapStatus, iconForStatus } from '../../models/status'
import { PathLabel } from '../lib/path-label'
import { Octicon } from '../octicons'
import { List } from '../list'

interface IFileListProps {
  readonly files: ReadonlyArray<FileChange>
  readonly selectedFile: FileChange | null
  readonly onSelectedFileChanged: (file: FileChange) => void
  readonly availableWidth: number
}

export class FileList extends React.Component<IFileListProps, void> {
  private onSelectionChanged = (row: number) => {
    const file = this.props.files[row]
    this.props.onSelectedFileChanged(file)
  }

  private renderFile = (row: number) => {
    const file = this.props.files[row]
    const status = file.status
    const fileStatus = mapStatus(status)

    return <div className='file'>

      <PathLabel
        path={file.path}
        oldPath={file.oldPath}
        status={file.status}
      />

      <Octicon
        symbol={iconForStatus(status)}
        className={'status status-' + fileStatus.toLowerCase()}
        title={fileStatus}
      />

    </div>
  }

  private rowForFile(file: FileChange | null): number {
    return file
      ? this.props.files.findIndex(f => f.path === file.path)
      : -1
  }

  public render() {
    return (
      <div className='file-list'>
        <List rowRenderer={this.renderFile}
              rowCount={this.props.files.length}
              rowHeight={40}
              selectedRow={this.rowForFile(this.props.selectedFile)}
              onSelectionChanged={this.onSelectionChanged}/>
      </div>
    )
  }
}
