import * as React from 'react'
import {IFileStatus} from '../../lib/local-git-operations'
import List from '../list'

interface ICommitSummaryProps {
  readonly summary: string
  readonly body: string
  readonly files: ReadonlyArray<IFileStatus>
  readonly selectedFile: IFileStatus | null
  readonly onSelectedFileChanged: (file: IFileStatus) => void
}

export default class CommitSummary extends React.Component<ICommitSummaryProps, void> {
  private onSelectionChanged(row: number) {
    const file = this.props.files[row]
    this.props.onSelectedFileChanged(file)
  }

  private renderFile(row: number) {
    const file = this.props.files[row]
    return <div key={file.name}
                title={file.name}
                className='name'>{file.name}</div>
  }

  private rowForFile(file_: IFileStatus | null): number {
    const file = file_
    if (!file) { return -1 }

    let index = 0
    this.props.files.forEach((f, i) => {
      if (f.name === file.name) {
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
