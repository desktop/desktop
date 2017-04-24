import * as React from 'react'
import * as classNames from 'classnames'

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
  readonly isExpanded: boolean
  readonly onExpandChanged: (isExpanded: boolean) => void
}

interface ICommitSummaryState {
  readonly isOverflowed: boolean
}

// https://wicg.github.io/ResizeObserver/#resizeobserverentry
interface IResizeObserverEntry {
  readonly target: Element
  readonly contentRect: ClientRect
};

export class CommitSummary extends React.Component<ICommitSummaryProps, ICommitSummaryState> {
  private descriptionScrollViewRef: HTMLDivElement | null
  private readonly resizeObserver: any | null = null
  private updateOverflowTimeoutId: number | null = null

  public constructor(props: ICommitSummaryProps) {
    super(props)

    this.state = { isOverflowed: false }

    const ResizeObserver = (window as any).ResizeObserver

    if (ResizeObserver || false) {
      this.resizeObserver = new ResizeObserver((entries: ReadonlyArray<IResizeObserverEntry>) => {
        for (const entry of entries) {
          if (entry.target === this.descriptionScrollViewRef) {
            // We might end up causing a recursive update by updating the state
            // when we're reacting to a resize so we'll defer it until after
            // react is done with this frame.
            if (this.updateOverflowTimeoutId !== null) {
              clearImmediate(this.updateOverflowTimeoutId)
            }

            this.updateOverflowTimeoutId = setImmediate(this.onResized)
          }
        }
      })
    }
  }

  private onResized = () => {
    if (this.props.isExpanded) {
      return
    }

    this.updateOverflow()
  }

  private onDescriptionScrollViewRef = (ref: HTMLDivElement | null) => {
    this.descriptionScrollViewRef = ref

    if (this.resizeObserver) {
      this.resizeObserver.disconnect()

      if (ref) {
        this.resizeObserver.observe(ref)
      } else {
        this.setState({ isOverflowed: false })
      }
    }
  }

  private renderExpander() {
    if (!this.props.body.length || (!this.props.isExpanded && !this.state.isOverflowed)) {
      return null
    }

    const expanded = this.props.isExpanded
    const onClick = expanded ? this.onCollapse : this.onExpand
    const icon = expanded ? OcticonSymbol.unfold : OcticonSymbol.fold

    return (
      <a onClick={onClick} className='expander'>
        <Octicon symbol={icon} />
        { expanded ? 'Collapse' : 'Expand' }
      </a>
    )
  }

  private onExpand = () => {
    this.props.onExpandChanged(true)
  }

  private onCollapse = () => {
    if (this.descriptionScrollViewRef) {
      this.descriptionScrollViewRef.scrollTop = 0
    }

    this.props.onExpandChanged(false)
  }

  private updateOverflow() {
    const scrollView = this.descriptionScrollViewRef
    if (scrollView) {
      this.setState({
        isOverflowed: scrollView.scrollHeight > scrollView.offsetHeight,
      })
    } else {
      if (this.state.isOverflowed) {
        this.setState({ isOverflowed: false })
      }
    }
  }

  public componentDidMount() {
    // No need to check if it overflows if we're expanded
    if (!this.props.isExpanded) {
      this.updateOverflow()
    }
  }

  public componentWillUpdate(nextProps: ICommitSummaryProps) {
    if (nextProps.body !== this.props.body) {
      this.setState({ isOverflowed: false })
    }
  }

  public componentDidUpdate(prevProps: ICommitSummaryProps) {
    // No need to check if it overflows if we're expanded
    if (!this.props.isExpanded) {
      // If the body has changed or we've just toggled the expanded
      // state we'll recalculate whether we overflow or not.
      if (prevProps.body !== this.props.body || prevProps.isExpanded) {
        this.updateOverflow()
      }
    } else {
      // Clear overflow state if we're expanded, we don't need it.
      if (this.state.isOverflowed) {
        this.setState({ isOverflowed: false })
      }
    }
  }

  private renderDescription() {

    if (!this.props.body) {
      return null
    }

    return (
      <div className='commit-summary-description-container'>
        <div className='commit-summary-description-scroll-view' ref={this.onDescriptionScrollViewRef}>
          <RichText
            className='commit-summary-description'
            emoji={this.props.emoji}
            repository={this.props.repository}
            text={this.props.body}
          />
        </div>

        {this.renderExpander()}
      </div>
    )
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

    const className = classNames({
      expanded: this.props.isExpanded,
      collapsed: !this.props.isExpanded,
      'has-expander': this.props.isExpanded || this.state.isOverflowed,
    })

    return (
      <div id='commit-summary' className={className}>
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
                <Avatar user={avatarUser} />
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

        {this.renderDescription()}
      </div>
    )
  }
}
