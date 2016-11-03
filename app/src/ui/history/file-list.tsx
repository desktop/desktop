import * as React from 'react'
import { FileChange } from '../../models/status'
import { List } from '../list'

interface IFileListProps {
  readonly files: ReadonlyArray<FileChange>
  readonly selectedFile: FileChange | null
  readonly onSelectedFileChanged: (file: FileChange) => void
}

export class FileList extends React.Component<IFileListProps, void> {
  private onSelectionChanged(row: number) {
    const file = this.props.files[row]
    this.props.onSelectedFileChanged(file)
  }

  private renderFile(row: number) {
    const file = this.props.files[row]
    return <div key={file.path}
                title={file.path}
                className='path'>{file.path}</div>
  }

  private rowForFile(file_: FileChange | null): number {
    const file = file_
    if (!file) { return -1 }

    let index = 0
    this.props.files.forEach((f, i) => {
      if (f.path === file.path) {
        index = i
        return
      }
    })
    return index
  }

  public render() {
    return (
      <div className='files'>
        <List rowRenderer={row => this.renderFile(row)}
              rowCount={this.props.files.length}
              rowHeight={40}
              selectedRow={this.rowForFile(this.props.selectedFile)}
              onSelectionChanged={row => this.onSelectionChanged(row)}/>
      </div>
    )
  }
}
