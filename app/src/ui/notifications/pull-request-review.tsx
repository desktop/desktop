import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Row } from '../lib/row'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { PullRequest } from '../../models/pull-request'
import { Dispatcher } from '../dispatcher'
import { Account } from '../../models/account'
import { getHTMLURL, IAPIPullRequestReview } from '../../lib/api'
import { Octicon } from '../octicons'
import { RepositoryWithGitHubRepository } from '../../models/repository'
import { SandboxedMarkdown } from '../lib/sandboxed-markdown'
import { Button } from '../lib/button'
import {
  getPullRequestReviewStateIcon,
  getVerbForPullRequestReview,
} from './pull-request-review-helpers'
import { LinkButton } from '../lib/link-button'

interface IPullRequestReviewProps {
  readonly dispatcher: Dispatcher
  readonly shouldCheckoutBranch: boolean
  readonly shouldChangeRepository: boolean
  readonly accounts: ReadonlyArray<Account>
  readonly repository: RepositoryWithGitHubRepository
  readonly pullRequest: PullRequest
  readonly review: IAPIPullRequestReview
  /** Map from the emoji shortcut (e.g., :+1:) to the image's local path. */
  readonly emoji: Map<string, string>
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
    const { review, repository } = this.props

    const { title, pullRequestNumber } = this.props.pullRequest
    const verb = getVerbForPullRequestReview(review)

    const header = (
      <div className="pull-request-review-dialog-header">
        <div className="title-container">
          <div>
            {__DARWIN__ ? 'Pull Request Review' : 'Pull request review'}
          </div>
          <span className="pr-title">
            <span className="pr-title">{title}</span>{' '}
            <span className="pr-number">#{pullRequestNumber}</span>{' '}
          </span>
        </div>
        {this.renderViewOnGitHubButton()}
      </div>
    )

    const authorUrl = `${getHTMLURL(repository.gitHubRepository.endpoint)}/${
      review.user.login
    }`

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
          <Row>
            <div className="review-summary-container">
              {this.renderReviewIcon()}
              <span className="review-summary">
                <LinkButton uri={authorUrl}>{review.user.login}</LinkButton>{' '}
                {verb} your pull request{review.body.length === 0 ? '.' : ':'}
              </span>
            </div>
          </Row>
          {this.renderReviewBody()}
        </DialogContent>
        <DialogFooter>{this.renderFooterContent()}</DialogFooter>
      </Dialog>
    )
  }

  private renderFooterContent() {
    const { review, shouldChangeRepository, shouldCheckoutBranch } = this.props

    const footerQuestion =
      review.state === 'APPROVED' ? null : (
        <div className="footer-question">
          <span>
            Do you want to switch to that Pull Request now and start working on
            the requested changes?
          </span>
        </div>
      )

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
        okButtonText={okButtonTitle}
        okButtonDisabled={this.state.switchingToPullRequest}
        onOkButtonClick={this.onSubmit}
      />
    )

    return footerQuestion === null ? (
      okCancelButtonGroup
    ) : (
      <Row>
        {footerQuestion}
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

    if (review.body.length === 0) {
      return null
    }

    return (
      <Row>
        <SandboxedMarkdown
          markdown={review.body}
          emoji={emoji}
          baseHref={base.gitHubRepository.htmlURL}
          repository={base.gitHubRepository}
          onMarkdownLinkClicked={this.onMarkdownLinkClicked}
        />
      </Row>
    )
  }

  private renderReviewIcon = () => {
    const { review } = this.props

    const icon = getPullRequestReviewStateIcon(review.state)
    return <Octicon symbol={icon.symbol} className={icon.className} />
  }

  private renderViewOnGitHubButton = () => {
    return (
      <div className="ci-check-rerun">
        <Button onClick={this.viewOnGitHub}>View on GitHub</Button>
      </div>
    )
  }

  private viewOnGitHub = () => {
    const { repository, pullRequest, dispatcher, review } = this.props

    // Some checks do not provide htmlURLS like ones for the legacy status
    // object as they do not have a view in the checks screen. In that case we
    // will just open the PR and they can navigate from there... a little
    // dissatisfying tho more of an edgecase anyways.
    const url =
      review.html_url ||
      `${repository.gitHubRepository.htmlURL}/pull/${pullRequest.pullRequestNumber}#pullrequestreview-${review.id}`
    if (url === null) {
      // The repository should have a htmlURL.
      return
    }
    dispatcher.openInBrowser(url)
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
    }

    this.props.onDismissed()
  }
}
