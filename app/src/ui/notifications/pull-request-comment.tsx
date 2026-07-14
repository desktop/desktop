import * as React from 'react'
import { Row } from '../lib/row'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { PullRequest } from '../../models/pull-request'
import { Dispatcher } from '../dispatcher'
import { RepositoryWithGitHubRepository } from '../../models/repository'
import { LinkButton } from '../lib/link-button'
import { IAPIComment } from '../../lib/api'
import { getPullRequestReviewStateIcon } from './pull-request-review-helpers'
import { PullRequestCommentLike } from './pull-request-comment-like'
import { Account } from '../../models/account'
import { Emoji } from '../../lib/emoji'

interface IPullRequestCommentProps {
  readonly dispatcher: Dispatcher
  readonly repository: RepositoryWithGitHubRepository
  readonly pullRequest: PullRequest
  readonly comment: IAPIComment

  /** Map from the emoji shortcut (e.g., :+1:) to the image's local path. */
  readonly emoji: Map<string, Emoji>

  readonly underlineLinks: boolean

  /**
   * Whether or not the dialog should offer to switch to the PR's repository or
   * to checkout the PR branch when applicable (e.g. non-approved reviews).
   */
  readonly shouldCheckoutBranch: boolean
  readonly shouldChangeRepository: boolean

  readonly onSubmit: () => void
  readonly onDismissed: () => void

  readonly accounts: ReadonlyArray<Account>
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
    const {
      dispatcher,
      repository,
      pullRequest,
      emoji,
      comment,
      onSubmit,
      onDismissed,
      accounts,
    } = this.props

    const icon = getPullRequestReviewStateIcon('COMMENTED')

    return (
      <PullRequestCommentLike
        id="pull-request-comment"
        dispatcher={dispatcher}
        repository={repository}
        pullRequest={pullRequest}
        emoji={emoji}
        eventDate={new Date(comment.created_at)}
        eventVerb="commented on"
        eventIconSymbol={icon.symbol}
        eventIconClass={icon.className}
        externalURL={comment.html_url}
        user={comment.user}
        body={comment.body}
        switchingToPullRequest={this.state.switchingToPullRequest}
        renderFooterContent={this.renderFooterContent}
        onSubmit={onSubmit}
        onDismissed={onDismissed}
        underlineLinks={this.props.underlineLinks}
        accounts={accounts}
      />
    )
  }

  private renderFooterContent = () => {
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

      dispatcher.incrementMetric(
        'pullRequestCommentDialogSwitchToPullRequestCount'
      )
    }

    this.props.onDismissed()
  }
}
