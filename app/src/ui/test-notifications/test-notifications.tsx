import React from 'react'
import { IAPIComment, IAPIPullRequestReview } from '../../lib/api'
import { assertNever } from '../../lib/fatal-error'
import { NotificationsDebugStore } from '../../lib/stores/notifications-debug-store'
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

enum TestNotificationType {
  PullRequestReview,
  PullRequestReviewComment,
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
    type: TestNotificationType.PullRequestReviewComment,
    steps: [
      TestNotificationStepKind.SelectPullRequest,
      TestNotificationStepKind.SelectPullRequestReview,
      TestNotificationStepKind.SelectPullRequestComment,
    ],
  },
]

type TestNotificationStepSelectPullRequestResult = {
  readonly kind: TestNotificationStepKind.SelectPullRequest
  readonly pullRequestNumber: number
}
type TestNotificationStepSelectPullRequestReviewResult = {
  readonly kind: TestNotificationStepKind.SelectPullRequestReview
  readonly reviewId: number
}
type TestNotificationStepSelectPullRequestCommentResult = {
  readonly kind: TestNotificationStepKind.SelectPullRequestComment
  readonly commentId: number
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
  readonly reviews: ReadonlyArray<IAPIPullRequestReview>
  readonly comments: ReadonlyArray<IAPIComment>
}

interface ITestNotificationsProps {
  readonly dispatcher: Dispatcher
  readonly notificationsDebugStore: NotificationsDebugStore
  readonly repository: RepositoryWithGitHubRepository
  readonly onDismissed: () => void
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
        : 'Pull Request Review Comment'

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

  private prepareForNextStep() {
    const nextStep = this.state.selectedFlow?.steps[this.state.stepResults.size]

    if (nextStep === undefined) {
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

        const pullRequestNumber = this.getPullRequestNumber()

        if (pullRequestNumber === null) {
          return
        }

        this.props.notificationsDebugStore
          .getPullRequestReviews(this.props.repository, pullRequestNumber)
          .then(reviews => {
            console.log('reviews', reviews)
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

        const pullRequestNumber = this.getPullRequestNumber()

        if (pullRequestNumber === null) {
          return
        }
        const reviewId = this.getReviewId()

        if (reviewId === null) {
          return
        }

        this.props.notificationsDebugStore
          .getPullRequestComments(this.props.repository, pullRequestNumber)
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

  private getPullRequestNumber(): number | null {
    const pullRequestResult = this.state.stepResults.get(
      TestNotificationStepKind.SelectPullRequest
    )

    if (pullRequestResult === undefined) {
      return null
    }

    return pullRequestResult.pullRequestNumber
  }

  private getReviewId(): number | null {
    const reviewResult = this.state.stepResults.get(
      TestNotificationStepKind.SelectPullRequestReview
    )

    if (reviewResult === undefined) {
      return null
    }

    return reviewResult.reviewId
  }

  private renderCurrentStep() {
    if (this.state.selectedFlow === null) {
      return (
        <div>
          <p>Select the type of notification to display:</p>
          {this.renderNotificationType(TestNotificationType.PullRequestReview)}
          {this.renderNotificationType(
            TestNotificationType.PullRequestReviewComment
          )}
        </div>
      )
    }

    const currentStep =
      this.state.selectedFlow.steps[this.state.stepResults.size]

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

    return (
      <div>
        List of PRs:
        <List
          rowHeight={40}
          rowCount={this.state.pullRequests.length}
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
      pullRequestNumber: pullRequest.pullRequestNumber,
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

    return (
      <div>
        List of PR reviews:
        <List
          rowHeight={40}
          rowCount={this.state.reviews.length}
          rowRenderer={this.renderPullRequestReviewRow}
          selectedRows={[]}
        />
      </div>
    )
  }

  private renderSelectPullRequestComment() {
    if (this.state.loading) {
      return <Loading />
    }

    return (
      <div>
        List of PR comments:
        <List
          rowHeight={40}
          rowCount={this.state.comments.length}
          rowRenderer={this.renderPullRequestCommentRow}
          selectedRows={[]}
        />
      </div>
    )
  }

  private renderPullRequestCommentRow = (row: number) => {
    return <div>{this.state.comments[row].body}</div>
  }

  private renderPullRequestReviewRow = (row: number) => {
    return <div>{this.state.reviews[row].body}</div>
  }

  private renderPullRequestRow = (row: number) => {
    return <div>{this.state.pullRequests[row].title}</div>
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
            okButtonText="OK"
            okButtonDisabled={false}
            cancelButtonDisabled={false}
            onCancelButtonClick={this.onDismissed}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
