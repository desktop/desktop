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
import { LinkButton } from '../lib/link-button'
import classNames from 'classnames'
import { Avatar } from '../lib/avatar'
import { formatRelative } from '../../lib/format-relative'
import { getStealthEmailForUser } from '../../lib/email'
import { IAPIComment } from '../../lib/api'

interface IPullRequestCommentProps {
  readonly dispatcher: Dispatcher
  readonly accounts: ReadonlyArray<Account>
  readonly repository: RepositoryWithGitHubRepository
  readonly pullRequest: PullRequest
  readonly comment: IAPIComment

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

interface IPullRequestCommentState {
  readonly switchingToPullRequest: boolean
}

/**
 * Dialog to show a pull request comment.
 */
export class PullRequestComment extends React.Component<
  IPullRequestCommentProps,
  IPullRequestCommentState
> {
  public constructor(props: IPullRequestCommentProps) {
    super(props)

    this.state = {
      switchingToPullRequest: false,
    }
  }

  public render() {
    const { title, pullRequestNumber } = this.props.pullRequest

    const header = (
      <div className="pull-request-comment-like-dialog-header">
        {this.renderPullRequestIcon()}
        <span className="pr-title">
          <span className="pr-title">{title}</span>{' '}
          <span className="pr-number">#{pullRequestNumber}</span>{' '}
        </span>
      </div>
    )

    return (
      <Dialog
        id="pull-request-comment"
        type="normal"
        title={header}
        dismissable={false}
        onSubmit={this.props.onSubmit}
        onDismissed={this.props.onDismissed}
        loading={this.state.switchingToPullRequest}
      >
        <DialogContent>
          <div className="comment-container">
            {this.renderTimelineItem()}
            {this.renderCommentBubble()}
          </div>
        </DialogContent>
        <DialogFooter>{this.renderFooterContent()}</DialogFooter>
      </Dialog>
    )
  }

  private renderTimelineItem() {
    const { comment, repository } = this.props
    const { user } = comment
    const { endpoint } = repository.gitHubRepository
    const userAvatar = {
      name: user.login,
      email: getStealthEmailForUser(user.id, user.login, endpoint),
      avatarURL: user.avatar_url,
      endpoint: endpoint,
    }

    const timelineItemClass = classNames('timeline-item', 'with-comment')

    const submittedAt = new Date(comment.created_at)
    const diff = submittedAt.getTime() - Date.now()
    const relativeReviewDate = formatRelative(diff)

    return (
      <div className="timeline-item-container">
        {this.renderDashedTimelineLine('top')}
        <div className={timelineItemClass}>
          <Avatar user={userAvatar} title={null} size={40} />
          <div className="review-icon-container pr-review-commented">
            <Octicon symbol={OcticonSymbol.eye} />
          </div>
          <div className="summary">
            <LinkButton uri={comment.user.html_url} className="author">
              {comment.user.login}
            </LinkButton>{' '}
            commented your pull request{' '}
            <LinkButton uri={comment.html_url} className="submission-date">
              {relativeReviewDate}
            </LinkButton>
          </div>
        </div>
      </div>
    )
  }

  private renderCommentBubble() {
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
    const { shouldChangeRepository, shouldCheckoutBranch, comment } = this.props

    let okButtonTitle: undefined | string = undefined

    if (shouldChangeRepository) {
      okButtonTitle = __DARWIN__
        ? 'Switch to Repository and Pull Request'
        : 'Switch to repository and pull request'
    } else if (shouldCheckoutBranch) {
      okButtonTitle = __DARWIN__
        ? 'Switch to Pull Request'
        : 'Switch to pull request'
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
          <LinkButton uri={comment.html_url}>{openInBrowserText}</LinkButton>
        </div>
        {okCancelButtonGroup}
      </Row>
    )
  }

  private onMarkdownLinkClicked = (url: string) => {
    this.props.dispatcher.openInBrowser(url)
  }

  private renderReviewBody() {
    const { comment, emoji, pullRequest } = this.props
    const { base } = pullRequest

    return (
      <SandboxedMarkdown
        markdown={comment.body}
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

  private onSubmit = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()

    const {
      dispatcher,
      repository,
      pullRequest,
      shouldChangeRepository,
      shouldCheckoutBranch,
    } = this.props

    if (shouldChangeRepository || shouldCheckoutBranch) {
      this.setState({ switchingToPullRequest: true })
      await dispatcher.selectRepository(repository)
      await dispatcher.checkoutPullRequest(repository, pullRequest)
      this.setState({ switchingToPullRequest: false })

      // dispatcher.recordPullRequestReviewDialogSwitchToPullRequest(review.state)
    }

    this.props.onDismissed()
  }
}
