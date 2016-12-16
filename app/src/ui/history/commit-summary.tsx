import * as React from 'react'
import { FileChange } from '../../models/status'
import { Octicon, OcticonSymbol } from '../octicons'
import { EmojiText } from '../lib/emoji-text'
import { LinkButton } from '../lib/link-button'
import { Repository } from '../../models/repository'

interface ICommitSummaryProps {
  readonly repository: Repository
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
    const shortSHA = this.props.sha.slice(0, 7)

    let url: string | null = null
    const gitHubRepository = this.props.repository.gitHubRepository
    if (gitHubRepository) {
      url = `${gitHubRepository.htmlURL}/commit/${this.props.sha}`
    }

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
              title={shortSHA} aria-label='SHA'>
              <span aria-hidden='true'>
                <Octicon symbol={OcticonSymbol.gitCommit} />
              </span>

              {url ? <LinkButton uri={url}>{shortSHA}</LinkButton> : shortSHA}
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
