import * as React from 'react'
import { FileChange } from '../../models/status'
import { Octicon, OcticonSymbol } from '../octicons'
import { RichText } from '../lib/rich-text'
import { LinkButton } from '../lib/link-button'
import { IGitHubUser } from '../../lib/dispatcher'
import { Repository } from '../../models/repository'
import { CommitIdentity } from '../../models/commit-identity'
import { Avatar } from '../lib/avatar'

interface ICommitSummaryProps {
  readonly repository: Repository
  readonly summary: string
  readonly body: string
  readonly sha: string
  readonly author: CommitIdentity
  readonly files: ReadonlyArray<FileChange>
  readonly emoji: Map<string, string>
  readonly isLocal: boolean
  readonly gitHubUser: IGitHubUser | null
}

interface ICommitSummaryState {
  readonly isExpanded: boolean
  readonly style: string
  readonly nextSymbol: OcticonSymbol
  readonly nextAction: string
}

const Expanded = {
  isExpanded: true,
  style: 'commit-summary-expanded',
  nextSymbol: OcticonSymbol.fold,
  nextAction: 'Collapse',
}

const Collapsed = {
  isExpanded: false,
  style: 'commit-summary-collapsed',
  nextSymbol: OcticonSymbol.unfold,
  nextAction: 'Expand',
}


export class CommitSummary extends React.Component<ICommitSummaryProps, ICommitSummaryState> {
  public constructor(props: ICommitSummaryProps) {
    super(props)

    this.state = Collapsed
  }

  private toggleExpander = () => {
    if (this.state.isExpanded) {
      this.setState(Collapsed)
    } else {
      this.setState(Expanded)
    }
  }

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
    let avatarUser = undefined
    if (this.props.gitHubUser) {
      avatarUser = { ...author, avatarURL: this.props.gitHubUser.avatarURL }
    }

    return (
      <div id='commit-summary'>
        <div className='commit-summary-header'>
          <RichText
            className='commit-summary-title'
            emoji={this.props.emoji}
            repository={this.props.repository}
            text={this.props.summary} />

          <ul className='commit-summary-meta'>
            <li className='commit-summary-meta-item'
              title={authorTitle} aria-label='Author'>
              <span aria-hidden='true'>
                <Avatar user={avatarUser}/>
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

        <a onClick={this.toggleExpander}>
          <Octicon symbol={this.state.nextSymbol} />
          {this.state.nextAction}
        </a>

        <RichText
          className={this.state.style + ' commit-summary-description'}
          emoji={this.props.emoji}
          repository={this.props.repository}
          text={this.props.body} />
      </div>
    )
  }
}
