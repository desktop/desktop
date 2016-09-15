import * as React from 'react'
import { FileChange } from '../../models/status'
import List from '../list'
import { Octicon, OcticonSymbol } from '../octicons'
import EmojiText from '../lib/emoji-text'

interface ICommitSummaryProps {
  readonly summary: string
  readonly body: string
  readonly sha: string
  readonly authorName: string
  readonly files: ReadonlyArray<FileChange>
  readonly selectedFile: FileChange | null
  readonly onSelectedFileChanged: (file: FileChange) => void
  readonly emoji: Map<string, string>
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
    const fileCount = this.props.files.length
    const filesPlural = fileCount === 1 ? 'file' : 'files'
    const filesDescription = `${fileCount} changed ${filesPlural}`
    return (
      <div className='panel' id='commit-summary'>
        <div className='commit-summary-header'>
          <EmojiText className='commit-summary-title' emoji={this.props.emoji}>
            {this.props.summary}
          </EmojiText>

          <ul className='commit-summary-meta byline'>
            <li className='commit-summary-meta-item'
              title={this.props.authorName} aria-label='Author'>
              <span aria-hidden='true'>
                <Octicon symbol={OcticonSymbol.person} />
              </span>

              {this.props.authorName}
            </li>

            <li className='commit-summary-meta-item'
              title={this.props.sha.slice(0,7)} aria-label='SHA'>
              <span aria-hidden='true'>
                <Octicon symbol={OcticonSymbol.gitCommit} />
              </span>

              {this.props.sha.slice(0,7)}
            </li>

            <li className='commit-summary-meta-item'
              title={filesDescription}>
              <span aria-hidden='true'>
                <Octicon symbol={OcticonSymbol.diff} />
              </span>

              {filesDescription}
            </li>
          </ul>
        </div>
        
        <EmojiText className='commit-summary-description' emoji={this.props.emoji}>{this.props.body}</EmojiText>

        <div className='files'>
          <List rowRenderer={row => this.renderFile(row)}
                rowCount={this.props.files.length}
                rowHeight={40}
                selectedRow={this.rowForFile(this.props.selectedFile)}
                onSelectionChanged={row => this.onSelectionChanged(row)}/>
        </div>
      </div>
    )
  }
}
