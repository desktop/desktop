import React from 'react'
import { assertNever } from '../../lib/fatal-error'
import { NotificationsDebugStore } from '../../lib/stores/notifications-debug-store'
import { PullRequest } from '../../models/pull-request'
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

type TestNotificationStepResult =
  | {
      readonly kind: TestNotificationStepKind.SelectPullRequest
      readonly pullRequestNumber: number
    }
  | {
      readonly kind: TestNotificationStepKind.SelectPullRequestReview
      readonly reviewId: number
    }
  | {
      readonly kind: TestNotificationStepKind.SelectPullRequestComment
      readonly commentId: number
    }

interface ITestNotificationsState {
  readonly selectedFlow: TestNotificationFlow | null
  readonly stepResults: ReadonlyMap<
    TestNotificationStepKind,
    TestNotificationStepResult
  >
  readonly loading: boolean
  readonly pullRequests: ReadonlyArray<PullRequest>
}

interface ITestNotificationsProps {
  readonly dispatcher: Dispatcher
  readonly notificationsDebugStore: NotificationsDebugStore
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
    this.setState({
      selectedFlow,
    })
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
          rowHeight={100}
          rowCount={this.state.pullRequests.length}
          rowRenderer={this.renderPullRequestRow}
          selectedRows={[]}
        />
      </div>
    )
  }

  private renderPullRequestRow = (row: number) => {
    return <div>{this.state.pullRequests[row].title}</div>
  }

  private renderSelectPullRequestReview() {
    return null
  }

  private renderSelectPullRequestComment() {
    return null
  }

  public render() {
    return (
      <Dialog
        id="test-notifications"
        onSubmit={this.onDismissed}
        dismissable={true}
        onDismissed={this.onDismissed}
        type="warning"
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
