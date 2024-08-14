import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { PullRequest } from '../../models/pull-request'
import { Dispatcher } from '../dispatcher'
import { Octicon, OcticonSymbol } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { RepositoryWithGitHubRepository } from '../../models/repository'
import { SandboxedMarkdown } from '../lib/sandboxed-markdown'
import { LinkButton } from '../lib/link-button'
import classNames from 'classnames'
import { Avatar } from '../lib/avatar'
import { formatRelative } from '../../lib/format-relative'
import { getStealthEmailForUser } from '../../lib/email'
import { IAPIIdentity } from '../../lib/api'
import { Account } from '../../models/account'
import { Emoji } from '../../lib/emoji'

interface IPullRequestCommentLikeProps {
  readonly id?: string
  readonly dispatcher: Dispatcher
  readonly repository: RepositoryWithGitHubRepository
  readonly pullRequest: PullRequest
  readonly eventDate: Date
  readonly eventVerb: string
  readonly eventIconSymbol: OcticonSymbol
  readonly eventIconClass: string
  readonly externalURL: string
  readonly user: IAPIIdentity
  readonly body: string

  /** Map from the emoji shortcut (e.g., :+1:) to the image's local path. */
  readonly emoji: Map<string, Emoji>

  readonly switchingToPullRequest: boolean

  readonly underlineLinks: boolean

  readonly renderFooterContent: () => JSX.Element

  readonly onSubmit: () => void
  readonly onDismissed: () => void

  readonly accounts: ReadonlyArray<Account>
}

/**
 * Dialog to show a pull request review.
 */
export abstract class PullRequestCommentLike extends React.Component<IPullRequestCommentLikeProps> {
  public render() {
    const { title, pullRequestNumber } = this.props.pullRequest

    const header = (
      <div className="pull-request-comment-like-dialog-header">
        {this.renderPullRequestIcon()}
        <span className="pr-title">
          {title} <span className="pr-number">#{pullRequestNumber}</span>{' '}
        </span>
      </div>
    )

    return (
      <Dialog
        id={this.props.id}
        type="normal"
        title={header}
        backdropDismissable={false}
        onSubmit={this.props.onSubmit}
        onDismissed={this.props.onDismissed}
        loading={this.props.switchingToPullRequest}
      >
        <DialogContent>
          <div className="comment-container">
            {this.renderTimelineItem()}
            {this.renderCommentBubble()}
          </div>
        </DialogContent>
        <DialogFooter>{this.props.renderFooterContent()}</DialogFooter>
      </Dialog>
    )
  }

  private renderTimelineItem() {
    const { user, repository, eventDate, eventVerb, externalURL, accounts } =
      this.props
    const { endpoint } = repository.gitHubRepository
    const userAvatar = {
      name: user.login,
      email: getStealthEmailForUser(user.id, user.login, endpoint),
      avatarURL: user.avatar_url,
      endpoint: endpoint,
    }

    const bottomLine = this.shouldRenderCommentBubble()
      ? null
      : this.renderDashedTimelineLine('bottom')

    const timelineItemClass = classNames('timeline-item', {
      'with-comment': this.shouldRenderCommentBubble(),
    })

    const diff = eventDate.getTime() - Date.now()
    const relativeReviewDate = formatRelative(diff)

    return (
      <div className="timeline-item-container">
        {this.renderDashedTimelineLine('top')}
        <div className={timelineItemClass}>
          <Avatar
            accounts={accounts}
            user={userAvatar}
            title={null}
            size={40}
          />
          {this.renderReviewIcon()}
          <div className="summary">
            <LinkButton uri={user.html_url} className="author">
              {user.login}
            </LinkButton>{' '}
            {eventVerb} your pull request{' '}
            <LinkButton uri={externalURL} className="submission-date">
              {relativeReviewDate}
            </LinkButton>
          </div>
        </div>
        {bottomLine}
      </div>
    )
  }

  private shouldRenderCommentBubble() {
    return this.props.body !== ''
  }

  private renderCommentBubble() {
    if (!this.shouldRenderCommentBubble()) {
      return null
    }

    return (
      <div className="comment-bubble-container">
        <div className="comment-bubble">{this.renderReviewBody()}</div>
        {this.renderDashedTimelineLine('bottom')}
      </div>
    )
  }

  private renderDashedTimelineLine(type: 'top' | 'bottom') {
    return (
      <svg
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        className={`timeline-line ${type}`}
      >
        {/* Need to use 0.5 for X to prevent nearest neighbour filtering causing
        the line to appear semi-transparent. */}
        <line x1="0.5" y1="0" x2="0.5" y2="100%" />
      </svg>
    )
  }

  private onMarkdownLinkClicked = (url: string) => {
    this.props.dispatcher.openInBrowser(url)
  }

  private renderReviewBody() {
    const { body, emoji, pullRequest } = this.props
    const { base } = pullRequest

    return (
      <SandboxedMarkdown
        markdown={body}
        emoji={emoji}
        baseHref={base.gitHubRepository.htmlURL ?? undefined}
        repository={base.gitHubRepository}
        onMarkdownLinkClicked={this.onMarkdownLinkClicked}
        markdownContext={'PullRequestComment'}
        underlineLinks={this.props.underlineLinks}
        ariaLabel="Pull request markdown comment"
      />
    )
  }

  private renderPullRequestIcon = () => {
    const { pullRequest } = this.props

    const cls = classNames('pull-request-icon', {
      draft: pullRequest.draft,
    })

    return (
      <Octicon
        className={cls}
        symbol={
          pullRequest.draft
            ? octicons.gitPullRequestDraft
            : octicons.gitPullRequest
        }
      />
    )
  }

  private renderReviewIcon = () => {
    const { eventIconSymbol, eventIconClass } = this.props

    return (
      <div className={classNames('review-icon-container', eventIconClass)}>
        <Octicon symbol={eventIconSymbol} />
      </div>
    )
  }
}
