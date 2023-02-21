import classNames from 'classnames'
import React from 'react'
import { getHTMLURL, IAPIComment } from '../../lib/api'
import { assertNever } from '../../lib/fatal-error'
import { NotificationsDebugStore } from '../../lib/stores/notifications-debug-store'
import {
  ValidNotificationPullRequestReview,
  ValidNotificationPullRequestReviewState,
} from '../../lib/valid-notification-pull-request-review'
import { PullRequest } from '../../models/pull-request'
import { RepositoryWithGitHubRepository } from '../../models/repository'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  OkCancelButtonGroup,
} from '../dialog'
import { DialogHeader } from '../dialog/header'
import { Dispatcher } from '../dispatcher'
import { Button } from '../lib/button'
import { List } from '../lib/list'
import { Loading } from '../lib/loading'
import { getPullRequestReviewStateIcon } from '../notifications/pull-request-review-helpers'
import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'

enum TestNotificationType {
  PullRequestReview,
  PullRequestComment,
}

enum TestNotificationStepKind {
  SelectPullRequest,
  SelectPullRequestReview,
  SelectPullRequestComment,
}

type TestNotificationFlow = {
  readonly type: TestNotificationType
  readonly steps: ReadonlyArray<TestNotificationStepKind>
}

const TestNotificationFlows: ReadonlyArray<TestNotificationFlow> = [
  {
    type: TestNotificationType.PullRequestReview,
    steps: [
      TestNotificationStepKind.SelectPullRequest,
      TestNotificationStepKind.SelectPullRequestReview,
    ],
  },
  {
    type: TestNotificationType.PullRequestComment,
    steps: [
      TestNotificationStepKind.SelectPullRequest,
      TestNotificationStepKind.SelectPullRequestComment,
    ],
  },
]

type TestNotificationStepSelectPullRequestResult = {
  readonly kind: TestNotificationStepKind.SelectPullRequest
  readonly pullRequest: PullRequest
}
type TestNotificationStepSelectPullRequestReviewResult = {
  readonly kind: TestNotificationStepKind.SelectPullRequestReview
  readonly review: ValidNotificationPullRequestReview
}
type TestNotificationStepSelectPullRequestCommentResult = {
  readonly kind: TestNotificationStepKind.SelectPullRequestComment
  readonly comment: IAPIComment
  readonly isIssueComment: boolean
}

type TestNotificationStepResultMap = Map<
  TestNotificationStepKind.SelectPullRequest,
  TestNotificationStepSelectPullRequestResult
> &
  Map<
    TestNotificationStepKind.SelectPullRequestReview,
    TestNotificationStepSelectPullRequestReviewResult
  > &
  Map<
    TestNotificationStepKind.SelectPullRequestComment,
    TestNotificationStepSelectPullRequestCommentResult
  >

interface ITestNotificationsState {
  readonly selectedFlow: TestNotificationFlow | null
  readonly stepResults: TestNotificationStepResultMap
  readonly loading: boolean
  readonly pullRequests: ReadonlyArray<PullRequest>
  readonly reviews: ReadonlyArray<ValidNotificationPullRequestReview>
  readonly comments: ReadonlyArray<IAPIComment>
}

interface ITestNotificationsProps {
  readonly dispatcher: Dispatcher
  readonly notificationsDebugStore: NotificationsDebugStore
  readonly repository: RepositoryWithGitHubRepository
  readonly onDismissed: () => void
}

class TestNotificationItemRowContent extends React.Component<{
  readonly leftAccessory?: JSX.Element
  readonly html_url?: string
  readonly dispatcher: Dispatcher
}> {
  public render() {
    const { leftAccessory, html_url, children } = this.props

    return (
      <div className="row-content">
        {leftAccessory && <div className="left-accessory">{leftAccessory}</div>}
        <div className="main-content">{children}</div>
        {html_url && (
          <div className="right-accessory">
            <Button onClick={this.onExternalLinkClick}>
              <Octicon symbol={OcticonSymbol.linkExternal} />
            </Button>
          </div>
        )}
      </div>
    )
  }

  private onExternalLinkClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const { dispatcher, html_url } = this.props

    if (html_url === undefined) {
      return
    }

    e.stopPropagation()
    dispatcher.openInBrowser(html_url)
  }
}

export class TestNotifications extends React.Component<
  ITestNotificationsProps,
  ITestNotificationsState
> {
  public constructor(props: ITestNotificationsProps) {
    super(props)

    this.state = {
      selectedFlow: null,
      stepResults: new Map(),
      loading: false,
      pullRequests: [],
      reviews: [],
      comments: [],
    }
  }

  private onDismissed = () => {
    this.props.dispatcher.closePopup()
  }

  private renderNotificationType = (
    type: TestNotificationType
  ): JSX.Element => {
    const title =
      type === TestNotificationType.PullRequestReview
        ? 'Pull Request Review'
        : 'Pull Request Comment'

    return (
      <Button onClick={this.getOnNotificationTypeClick(type)}>{title}</Button>
    )
  }

  private getOnNotificationTypeClick = (type: TestNotificationType) => () => {
    const selectedFlow =
      TestNotificationFlows.find(f => f.type === type) ?? null

    this.setState(
      {
        selectedFlow,
      },
      () => {
        this.prepareForNextStep()
      }
    )
  }

  private doFinalAction() {
    const selectedFlow = this.state.selectedFlow

    if (selectedFlow === null) {
      return
    }

    switch (selectedFlow.type) {
      case TestNotificationType.PullRequestReview: {
        const pullRequestNumber = this.getPullRequest()
        const review = this.getReview()

        if (pullRequestNumber === null || review === null) {
          return
        }

        this.props.notificationsDebugStore.simulatePullRequestReviewNotification(
          this.props.repository.gitHubRepository,
          pullRequestNumber,
          review
        )
        break
      }
      case TestNotificationType.PullRequestComment: {
        const pullRequest = this.getPullRequest()
        const commentInfo = this.getCommentInfo()

        if (pullRequest === null || commentInfo === null) {
          return
        }

        const { comment, isIssueComment } = commentInfo

        this.props.notificationsDebugStore.simulatePullRequestCommentNotification(
          this.props.repository.gitHubRepository,
          pullRequest,
          comment,
          isIssueComment
        )
        break
      }
      default:
        assertNever(selectedFlow.type, `Unknown flow type: ${selectedFlow}`)
    }
  }

  private prepareForNextStep() {
    const nextStep = this.state.selectedFlow?.steps[this.state.stepResults.size]

    if (nextStep === undefined) {
      this.doFinalAction()
      this.back()
      return
    }

    switch (nextStep) {
      case TestNotificationStepKind.SelectPullRequest: {
        this.setState({
          loading: true,
        })

        this.props.notificationsDebugStore
          .getPullRequests(this.props.repository)
          .then(pullRequests => {
            this.setState({
              pullRequests,
              loading: false,
            })
          })
        break
      }
      case TestNotificationStepKind.SelectPullRequestReview: {
        this.setState({
          loading: true,
        })

        const pullRequest = this.getPullRequest()

        if (pullRequest === null) {
          return
        }

        this.props.notificationsDebugStore
          .getPullRequestReviews(
            this.props.repository,
            pullRequest.pullRequestNumber
          )
          .then(reviews => {
            this.setState({
              reviews,
              loading: false,
            })
          })
        break
      }
      case TestNotificationStepKind.SelectPullRequestComment: {
        this.setState({
          loading: true,
        })

        const pullRequest = this.getPullRequest()

        if (pullRequest === null) {
          return
        }

        this.props.notificationsDebugStore
          .getPullRequestComments(
            this.props.repository,
            pullRequest.pullRequestNumber
          )
          .then(comments => {
            this.setState({
              comments,
              loading: false,
            })
          })
        break
      }
      default:
        assertNever(nextStep, `Unknown step: ${nextStep}`)
    }
  }

  private getPullRequest(): PullRequest | null {
    const pullRequestResult = this.state.stepResults.get(
      TestNotificationStepKind.SelectPullRequest
    )

    if (pullRequestResult === undefined) {
      return null
    }

    return pullRequestResult.pullRequest
  }

  private getReview(): ValidNotificationPullRequestReview | null {
    const reviewResult = this.state.stepResults.get(
      TestNotificationStepKind.SelectPullRequestReview
    )

    if (reviewResult === undefined) {
      return null
    }

    return reviewResult.review
  }

  private getCommentInfo() {
    const commentResult = this.state.stepResults.get(
      TestNotificationStepKind.SelectPullRequestComment
    )

    if (commentResult === undefined) {
      return null
    }

    return {
      comment: commentResult.comment,
      isIssueComment: commentResult.isIssueComment,
    }
  }

  private renderCurrentStep() {
    if (this.state.selectedFlow === null) {
      return (
        <div>
          <p>Select the type of notification to display:</p>
          <div className="notification-type-list">
            {this.renderNotificationType(
              TestNotificationType.PullRequestReview
            )}
            {this.renderNotificationType(
              TestNotificationType.PullRequestComment
            )}
          </div>
        </div>
      )
    }

    const currentStep = this.state.selectedFlow.steps.at(
      this.state.stepResults.size
    )

    if (currentStep === undefined) {
      return <p>Done!</p>
    }

    switch (currentStep) {
      case TestNotificationStepKind.SelectPullRequest:
        return this.renderSelectPullRequest()
      case TestNotificationStepKind.SelectPullRequestReview:
        return this.renderSelectPullRequestReview()
      case TestNotificationStepKind.SelectPullRequestComment:
        return this.renderSelectPullRequestComment()
      default:
        return assertNever(currentStep, `Unknown step: ${currentStep}`)
    }
  }

  private renderSelectPullRequest() {
    if (this.state.loading) {
      return <Loading />
    }

    const { pullRequests } = this.state

    if (pullRequests.length === 0) {
      return <p>No pull requests found</p>
    }

    return (
      <div>
        Pull requests:
        <List
          rowHeight={40}
          rowCount={pullRequests.length}
          rowRenderer={this.renderPullRequestRow}
          selectedRows={[]}
          onRowClick={this.onPullRequestRowClick}
        />
      </div>
    )
  }

  private onPullRequestRowClick = (row: number) => {
    const pullRequest = this.state.pullRequests[row]
    const stepResults = this.state.stepResults
    stepResults.set(TestNotificationStepKind.SelectPullRequest, {
      kind: TestNotificationStepKind.SelectPullRequest,
      pullRequest: pullRequest,
    })

    this.setState(
      {
        stepResults,
      },
      () => {
        this.prepareForNextStep()
      }
    )
  }

  private renderSelectPullRequestReview() {
    if (this.state.loading) {
      return <Loading />
    }

    const { reviews } = this.state

    if (reviews.length === 0) {
      return <p>No reviews found</p>
    }

    return (
      <div>
        Reviews:
        <List
          rowHeight={40}
          rowCount={reviews.length}
          rowRenderer={this.renderPullRequestReviewRow}
          selectedRows={[]}
          onRowClick={this.onPullRequestReviewRowClick}
        />
      </div>
    )
  }

  private onPullRequestReviewRowClick = (row: number) => {
    const review = this.state.reviews[row]
    const stepResults = this.state.stepResults
    stepResults.set(TestNotificationStepKind.SelectPullRequestReview, {
      kind: TestNotificationStepKind.SelectPullRequestReview,
      review: review,
    })

    this.setState(
      {
        stepResults,
      },
      () => {
        this.prepareForNextStep()
      }
    )
  }

  private renderSelectPullRequestComment() {
    if (this.state.loading) {
      return <Loading />
    }

    const { comments } = this.state

    if (comments.length === 0) {
      return <p>No comments found</p>
    }

    return (
      <div>
        Comments:
        <List
          rowHeight={40}
          rowCount={comments.length}
          rowRenderer={this.renderPullRequestCommentRow}
          selectedRows={[]}
          onRowClick={this.onPullRequestCommentRowClick}
        />
      </div>
    )
  }

  private onPullRequestCommentRowClick = (row: number) => {
    const comment = this.state.comments[row]
    const stepResults = this.state.stepResults
    stepResults.set(TestNotificationStepKind.SelectPullRequestComment, {
      kind: TestNotificationStepKind.SelectPullRequestComment,
      comment: comment,
      isIssueComment: comment.html_url.includes('#issuecomment-'),
    })

    this.setState(
      {
        stepResults,
      },
      () => {
        this.prepareForNextStep()
      }
    )
  }

  private renderPullRequestCommentRow = (row: number) => {
    const comment = this.state.comments[row]
    return (
      <TestNotificationItemRowContent
        dispatcher={this.props.dispatcher}
        html_url={comment.html_url}
        leftAccessory={this.renderReviewStateIcon('COMMENTED')}
      >
        {comment.body}
        <br />
        by <i>{comment.user.login}</i>
      </TestNotificationItemRowContent>
    )
  }

  private renderPullRequestReviewRow = (row: number) => {
    const review = this.state.reviews[row]

    return (
      <TestNotificationItemRowContent
        dispatcher={this.props.dispatcher}
        html_url={review.html_url}
        leftAccessory={this.renderReviewStateIcon(review.state)}
      >
        {review.body || <i>Review without body</i>}
        <br />
        by <i>{review.user.login}</i>
      </TestNotificationItemRowContent>
    )
  }

  private renderReviewStateIcon = (
    state: ValidNotificationPullRequestReviewState
  ) => {
    const icon = getPullRequestReviewStateIcon(state)
    return (
      <div className={classNames('review-icon-container', icon.className)}>
        <Octicon symbol={icon.symbol} />
      </div>
    )
  }

  private renderPullRequestRow = (row: number) => {
    const pullRequest = this.state.pullRequests[row]
    const repository = this.props.repository.gitHubRepository
    const endpointHtmlUrl = getHTMLURL(repository.endpoint)
    const htmlURL = `${endpointHtmlUrl}/${repository.owner.login}/${repository.name}/pull/${pullRequest.pullRequestNumber}`

    return (
      <TestNotificationItemRowContent
        dispatcher={this.props.dispatcher}
        html_url={htmlURL}
        leftAccessory={this.renderPullRequestStateIcon(pullRequest)}
      >
        <b>
          #{pullRequest.pullRequestNumber}
          {pullRequest.draft ? ' (Draft)' : ''}:
        </b>{' '}
        {pullRequest.title} <br />
        by <i>{pullRequest.author}</i>
      </TestNotificationItemRowContent>
    )
  }

  private renderPullRequestStateIcon = (
    pullRequest: PullRequest
  ): JSX.Element => {
    return (
      <Octicon
        className={pullRequest.draft ? 'pr-draft-icon' : 'pr-icon'}
        symbol={
          pullRequest.draft
            ? OcticonSymbol.gitPullRequestDraft
            : OcticonSymbol.gitPullRequest
        }
      />
    )
  }

  public render() {
    return (
      <Dialog
        id="test-notifications"
        onSubmit={this.onDismissed}
        dismissable={true}
        onDismissed={this.onDismissed}
      >
        <DialogHeader
          title="Test Notifications"
          dismissable={true}
          onDismissed={this.onDismissed}
        />
        <DialogContent>{this.renderCurrentStep()}</DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText="Close"
            okButtonDisabled={false}
            cancelButtonDisabled={false}
            cancelButtonVisible={this.state.selectedFlow !== null}
            cancelButtonText="Back"
            onCancelButtonClick={this.onBack}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onBack = (event: React.MouseEvent<HTMLButtonElement>) => {
    this.back()
    event.preventDefault()
  }

  private back() {
    const { selectedFlow, stepResults } = this.state
    if (selectedFlow === null) {
      return
    }

    if (stepResults.size === 0) {
      this.setState(
        {
          selectedFlow: null,
          stepResults: new Map(),
        },
        () => {
          this.prepareForNextStep()
        }
      )
    }

    const steps = selectedFlow.steps
    const lastStep = steps.at(stepResults.size - 1)
    if (lastStep === undefined) {
      return
    }

    const newStepResults: Map<TestNotificationStepKind, any> = new Map(
      stepResults
    )
    newStepResults.delete(lastStep)

    this.setState(
      {
        stepResults: newStepResults as TestNotificationStepResultMap,
      },
      () => {
        this.prepareForNextStep()
      }
    )
  }
}
