import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Row } from '../lib/row'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { PullRequest } from '../../models/pull-request'
import { Dispatcher } from '../dispatcher'
import { Account } from '../../models/account'
import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { RepositoryWithGitHubRepository } from '../../models/repository'
import { SandboxedMarkdown } from '../lib/sandboxed-markdown'
import {
  getPullRequestReviewStateIcon,
  getVerbForPullRequestReview,
} from './pull-request-review-helpers'
import { LinkButton } from '../lib/link-button'
import classNames from 'classnames'
import { Avatar } from '../lib/avatar'
import { formatRelative } from '../../lib/format-relative'
import { ValidNotificationPullRequestReview } from '../../lib/valid-notification-pull-request-review'
import { getStealthEmailForUser } from '../../lib/email'

interface IPullRequestReviewProps {
  readonly dispatcher: Dispatcher
  readonly accounts: ReadonlyArray<Account>
  readonly repository: RepositoryWithGitHubRepository
  readonly pullRequest: PullRequest
  readonly review: ValidNotificationPullRequestReview
  readonly numberOfComments: number

  /** Map from the emoji shortcut (e.g., :+1:) to the image's local path. */
  readonly emoji: Map<string, string>

  /**
   * Whether or not the dialog should offer to switch to the PR's repository or
   * to checkout the PR branch when applicable (e.g. non-approved reviews).
   */
  readonly shouldCheckoutBranch: boolean
  readonly shouldChangeRepository: boolean

  readonly onSubmit: () => void
  readonly onDismissed: () => void
}

interface IPullRequestReviewState {
  readonly switchingToPullRequest: boolean
}

/**
 * Dialog to show the result of a CI check run.
 */
export class PullRequestReview extends React.Component<
  IPullRequestReviewProps,
  IPullRequestReviewState
> {
  public constructor(props: IPullRequestReviewProps) {
    super(props)

    this.state = {
      switchingToPullRequest: false,
    }
  }

  public render() {
    const { title, pullRequestNumber } = this.props.pullRequest

    const header = (
      <div className="pull-request-review-dialog-header">
        {this.renderPullRequestIcon()}
        <span className="pr-title">
          <span className="pr-title">{title}</span>{' '}
          <span className="pr-number">#{pullRequestNumber}</span>{' '}
        </span>
      </div>
    )

    return (
      <Dialog
        id="pull-request-review"
        type="normal"
        title={header}
        dismissable={false}
        onSubmit={this.props.onSubmit}
        onDismissed={this.props.onDismissed}
        loading={this.state.switchingToPullRequest}
      >
        <DialogContent>
          <div className="review-container">
            {this.renderTimelineItem()}
            {this.renderCommentBubble()}
          </div>
        </DialogContent>
        <DialogFooter>{this.renderFooterContent()}</DialogFooter>
      </Dialog>
    )
  }

  private renderTimelineItem() {
    const { review, repository } = this.props
    const { user } = review
    const { endpoint } = repository.gitHubRepository
    const verb = getVerbForPullRequestReview(review)
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

    const submittedAt = new Date(review.submitted_at)
    const diff = submittedAt.getTime() - Date.now()
    const relativeReviewDate = formatRelative(diff)

    return (
      <div className="timeline-item-container">
        {this.renderDashedTimelineLine('top')}
        <div className={timelineItemClass}>
          <Avatar user={userAvatar} title={null} size={40} />
          {this.renderReviewIcon()}
          <div className="summary">
            <LinkButton uri={review.user.html_url} className="reviewer">
              {review.user.login}
            </LinkButton>{' '}
            {verb} your pull request{' '}
            <LinkButton uri={review.html_url} className="submission-date">
              {relativeReviewDate}
            </LinkButton>
          </div>
        </div>
        {bottomLine}
      </div>
    )
  }

  private shouldRenderCommentBubble() {
    return this.props.review.body !== ''
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
        xmlns="http://www.w3.org/2000/svg"
        className={`timeline-line ${type}`}
      >
        {/* Need to use 0.5 for X to prevent nearest neighbour filtering causing
        the line to appear semi-transparent. */}
        <line x1="0.5" y1="0" x2="0.5" y2="100%" />
      </svg>
    )
  }

  private renderFooterContent() {
    const { review, shouldChangeRepository, shouldCheckoutBranch } = this.props
    const isApprovedReview = review.state === 'APPROVED'

    let okButtonTitle: undefined | string = undefined

    if (!isApprovedReview) {
      if (shouldChangeRepository) {
        okButtonTitle = __DARWIN__
          ? 'Switch to Repository and Pull Request'
          : 'Switch to repository and pull request'
      } else if (shouldCheckoutBranch) {
        okButtonTitle = __DARWIN__
          ? 'Switch to Pull Request'
          : 'Switch to pull request'
      }
    }

    const okCancelButtonGroup = (
      <OkCancelButtonGroup
        onCancelButtonClick={this.props.onDismissed}
        cancelButtonText="Dismiss"
        // If there is nothing special about the OK button, just hide the cancel
        // button, since they will both just dismiss the dialog.
        cancelButtonVisible={okButtonTitle !== undefined}
        okButtonText={okButtonTitle}
        okButtonDisabled={this.state.switchingToPullRequest}
        onOkButtonClick={this.onSubmit}
      />
    )

    const openInBrowserText = __DARWIN__ ? 'Open in Browser' : 'Open in browser'

    return (
      <Row>
        <div className="footer-links">
          <LinkButton uri={review.html_url}>{openInBrowserText}</LinkButton>
        </div>
        {okCancelButtonGroup}
      </Row>
    )
  }

  private onMarkdownLinkClicked = (url: string) => {
    this.props.dispatcher.openInBrowser(url)
  }

  private renderReviewBody() {
    const { review, emoji, pullRequest } = this.props
    const { base } = pullRequest

    return (
      <SandboxedMarkdown
        markdown={review.body}
        emoji={emoji}
        baseHref={base.gitHubRepository.htmlURL ?? undefined}
        repository={base.gitHubRepository}
        onMarkdownLinkClicked={this.onMarkdownLinkClicked}
        markdownContext={'PullRequestComment'}
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
            ? OcticonSymbol.gitPullRequestDraft
            : OcticonSymbol.gitPullRequest
        }
      />
    )
  }

  private renderReviewIcon = () => {
    const { review } = this.props

    const icon = getPullRequestReviewStateIcon(review.state)
    return (
      <div className={classNames('review-icon-container', icon.className)}>
        <Octicon symbol={icon.symbol} />
      </div>
    )
  }

  private onSubmit = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()

    const {
      dispatcher,
      repository,
      pullRequest,
      shouldChangeRepository,
      shouldCheckoutBranch,
      review,
    } = this.props

    const isApprovedReview = review.state === 'APPROVED'

    // Only switch to the PR when needed, if it's not an approved review
    if (!isApprovedReview && (shouldChangeRepository || shouldCheckoutBranch)) {
      this.setState({ switchingToPullRequest: true })
      await dispatcher.selectRepository(repository)
      await dispatcher.checkoutPullRequest(repository, pullRequest)
      this.setState({ switchingToPullRequest: false })

      dispatcher.recordPullRequestReviewDialogSwitchToPullRequest(review.state)
    }

    this.props.onDismissed()
  }
}
