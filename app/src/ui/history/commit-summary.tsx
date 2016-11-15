import * as React from 'react'
import { FileChange } from '../../models/status'
import { Octicon, OcticonSymbol } from '../octicons'
import { EmojiText } from '../lib/emoji-text'

interface ICommitSummaryProps {
  readonly summary: string
  readonly body: string
  readonly sha: string
  readonly authorName: string
  readonly files: ReadonlyArray<FileChange>
  readonly emoji: Map<string, string>
}

export class CommitSummary extends React.Component<ICommitSummaryProps, void> {
  public render() {
    const fileCount = this.props.files.length
    const filesPlural = fileCount === 1 ? 'file' : 'files'
    const filesDescription = `${fileCount} changed ${filesPlural}`
    return (
      <div id='commit-summary'>
        <div className='commit-summary-header'>
          <EmojiText className='commit-summary-title' emoji={this.props.emoji}>
            {this.props.summary}
          </EmojiText>

          <ul className='commit-summary-meta'>
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
      </div>
    )
  }
}
