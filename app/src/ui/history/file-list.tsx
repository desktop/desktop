import * as React from 'react'
import { FileStatus, FileChange, mapStatus } from '../../models/status'
import { Octicon, OcticonSymbol, iconForStatus } from '../octicons'
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

  private renderPathLabel(file: FileChange) {
    const props: React.HTMLProps<HTMLLabelElement> = {
      className: 'path',
      title: file.path,
    }

    if (file.status === FileStatus.Renamed && file.oldPath) {
      return (
        <label {...props}>
          {file.oldPath} <Octicon symbol={OcticonSymbol.arrowRight} /> {file.path}
        </label>
      )
    } else {
      return <label {...props}>{file.path}</label>
    }
  }

  private renderFile(row: number) {
    const file = this.props.files[row]
    const fileStatus = mapStatus(file.status)

    return <div className='commit-file'>
      {this.renderPathLabel(file)}

      <div className={'status status-' + fileStatus.toLowerCase()} title={fileStatus}>
        <Octicon symbol={iconForStatus(file.status)} />
      </div>
    </div>
  }

  private rowForFile(file: FileChange | null): number {
    return file
      ? this.props.files.findIndex(f => f.path === file.path)
      : -1
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
