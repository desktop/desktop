import * as React from 'react'
import { FileChange } from '../../models/status'
import { Octicon, OcticonSymbol } from '../octicons'
import { EmojiText } from '../lib/emoji-text'
import { LinkButton } from '../lib/link-button'
import { Repository } from '../../models/repository'
import { CommitIdentity } from '../../models/commit-identity'

interface ICommitSummaryProps {
  readonly repository: Repository
  readonly summary: string
  readonly body: string
  readonly sha: string
  readonly author: CommitIdentity
  readonly files: ReadonlyArray<FileChange>
  readonly emoji: Map<string, string>
  readonly isLocal: boolean
  readonly avatarURL: string | null
}

export class CommitSummary extends React.Component<ICommitSummaryProps, void> {
  public render() {
    const fileCount = this.props.files.length
    const filesPlural = fileCount === 1 ? 'file' : 'files'
    const filesDescription = `${fileCount} changed ${filesPlural}`
    const shortSHA = this.props.sha.slice(0, 7)

    let url: string | null = null
    if (!this.props.isLocal) {
      const gitHubRepository = this.props.repository.gitHubRepository
      if (gitHubRepository) {
        url = `${gitHubRepository.htmlURL}/commit/${this.props.sha}`
      }
    }

    const author = this.props.author
    const authorTitle = `${author.name} <${author.email}>`

    const DefaultAvatarURL = 'https://github.com/hubot.png'
    const avatarURL = this.props.avatarURL || DefaultAvatarURL

    return (
      <div id='commit-summary'>
        <div className='commit-summary-header'>
          <EmojiText className='commit-summary-title' emoji={this.props.emoji}>
            {this.props.summary}
          </EmojiText>

          <ul className='commit-summary-meta'>
            <li className='commit-summary-meta-item'
              title={authorTitle} aria-label='Author'>
              <span aria-hidden='true'>
                <img className='avatar' src={avatarURL}/>
              </span>

              {author.name}
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
