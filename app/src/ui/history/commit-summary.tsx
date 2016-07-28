import * as React from 'react'
import { FileChange } from '../../models/status'
import List from '../list'

interface ICommitSummaryProps {
  readonly summary: string
  readonly body: string
  readonly files: ReadonlyArray<FileChange>
  readonly selectedFile: FileChange | null
  readonly onSelectedFileChanged: (file: FileChange) => void
}

export default class CommitSummary extends React.Component<ICommitSummaryProps, void> {
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
      <div>
        <div>{this.props.summary}</div>
        <div>&nbsp;</div>
        <div>{this.props.body}</div>
        <div className='files'>
          <List renderItem={row => this.renderFile(row)}
                itemCount={this.props.files.length}
                itemHeight={22}
                selectedRow={this.rowForFile(this.props.selectedFile)}
                onSelectionChanged={row => this.onSelectionChanged(row)}/>
        </div>
      </div>
    )
  }
}
