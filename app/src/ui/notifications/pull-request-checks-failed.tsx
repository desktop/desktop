import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Row } from '../lib/row'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { PullRequest } from '../../models/pull-request'
import { Dispatcher } from '../dispatcher'
import { CICheckRunList } from '../check-runs/ci-check-run-list'
import {
  IRefCheck,
  getLatestPRWorkflowRunsLogsForCheckRun,
  getCheckRunActionsJobsAndLogURLS,
  isFailure,
} from '../../lib/ci-checks/ci-checks'
import { CICheckRunLogs } from '../check-runs/ci-check-run-item-logs'
import { Account } from '../../models/account'
import { API, getHTMLURL } from '../../lib/api'
import { Octicon, syncClockwise } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { Button } from '../lib/button'
import { RepositoryWithGitHubRepository } from '../../models/repository'

interface IPullRequestChecksFailedProps {
  readonly dispatcher: Dispatcher
  readonly shouldChangeRepository: boolean
  readonly accounts: ReadonlyArray<Account>
  readonly repository: RepositoryWithGitHubRepository
  readonly pullRequest: PullRequest
  readonly commitMessage: string
  readonly commitSha: string
  readonly checks: ReadonlyArray<IRefCheck>
  readonly onSubmit: () => void
  readonly onDismissed: () => void
}

interface IPullRequestChecksFailedState {
  readonly switchingToPullRequest: boolean
  readonly selectedCheckID: number
  readonly checks: ReadonlyArray<IRefCheck>
  readonly loadingActionWorkflows: boolean
  readonly loadingActionLogs: boolean
}

/**
 * Dialog to show the result of a CI check run.
 */
export class PullRequestChecksFailed extends React.Component<
  IPullRequestChecksFailedProps,
  IPullRequestChecksFailedState
> {
  private checkRunsLoadCancelled: boolean = false

  public constructor(props: IPullRequestChecksFailedProps) {
    super(props)

    const { checks } = this.props

    const selectedCheck = checks.find(isFailure) ?? checks[0]
    this.state = {
      switchingToPullRequest: false,
      selectedCheckID: selectedCheck.id,
      checks,
      loadingActionWorkflows: true,
      loadingActionLogs: true,
    }
  }

  public render() {
    let okButtonTitle = __DARWIN__
      ? 'Switch to Pull Request'
      : 'Switch to pull request'

    if (this.props.shouldChangeRepository) {
      okButtonTitle = __DARWIN__
        ? 'Switch to Repository and Pull Request'
        : 'Switch to repository and pull request'
    }

    const { pullRequest, repository } = this.props

    const dialogTitle = (
      <span className="custom-title">
        <Octicon
          className={pullRequest.draft ? 'draft' : undefined}
          symbol={OcticonSymbol.gitPullRequest}
        />
        <span className="pr-title">{pullRequest.title}</span>{' '}
        <span className="pr-number">#{pullRequest.pullRequestNumber}</span>{' '}
      </span>
    )

    const selectedCheck = this.state.checks.find(
      check => check.id === this.state.selectedCheckID
    )

    const failedChecks = this.state.checks.filter(
      check => check.conclusion === 'failure'
    )
    const pluralChecks = failedChecks.length > 1 ? 'checks' : 'check'
    const pluralThem = failedChecks.length > 1 ? 'them' : 'it'

    const loading =
      this.state.loadingActionWorkflows ||
      this.state.loadingActionLogs ||
      this.state.switchingToPullRequest

    const baseHref = getHTMLURL(repository.gitHubRepository.endpoint)

    return (
      <Dialog
        id="pull-request-checks-failed"
        type="normal"
        title={dialogTitle}
        dismissable={false}
        onSubmit={this.props.onSubmit}
        onDismissed={this.props.onDismissed}
        loading={loading}
      >
        <DialogContent>
          <Row>
            <span className="summary">
              {failedChecks.length} {pluralChecks} failed in your pull request.
              Do you want to switch to that Pull Request now and start fixing{' '}
              {pluralThem}?
            </span>
          </Row>
          <Row>
            <div className="ci-check-run-dialog-container">
              <div className="ci-check-run-header">
                <span className="message">
                  {this.props.commitMessage.slice(0, 72)}
                </span>
                <span aria-hidden="true">
                  <Octicon symbol={OcticonSymbol.gitCommit} />
                </span>{' '}
                <span className="sha">{this.props.commitSha.slice(0, 9)}</span>
                {this.renderRerunButton()}
              </div>
              <div className="ci-check-run-content">
                <CICheckRunList
                  checkRuns={this.state.checks}
                  loadingActionLogs={this.state.loadingActionLogs}
                  loadingActionWorkflows={this.state.loadingActionWorkflows}
                  showLogsInline={false}
                  selectable={true}
                  selectedCheckRun={selectedCheck}
                  baseHref={baseHref}
                  onViewOnGitHub={this.onViewOnGitHub}
                  onCheckRunClick={this.onCheckRunClick}
                />
                {selectedCheck !== undefined && (
                  <CICheckRunLogs
                    checkRun={selectedCheck}
                    loadingActionLogs={this.state.loadingActionLogs}
                    loadingActionWorkflows={this.state.loadingActionWorkflows}
                    baseHref={baseHref}
                  />
                )}
              </div>
            </div>
          </Row>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            onCancelButtonClick={this.props.onDismissed}
            cancelButtonText="Dismiss"
            okButtonText={okButtonTitle}
            onOkButtonClick={this.onSubmit}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  public componentDidMount() {
    this.loadCheckRunLogs()
  }

  public componentWillUnmount() {
    this.checkRunsLoadCancelled = true
  }

  private renderRerunButton = () => {
    const { checks } = this.state
    return (
      <div className="ci-check-rerun">
        <Button onClick={this.rerunJobs} disabled={checks.length === 0}>
          <Octicon symbol={syncClockwise} /> Re-run jobs
        </Button>
      </div>
    )
  }

  private rerunJobs = () => {
    // Get unique set of check suite ids
    const checkSuiteIds = new Set<number | null>([
      ...this.state.checks.map(cr => cr.checkSuiteId),
    ])

    for (const id of checkSuiteIds) {
      if (id === null) {
        continue
      }
      this.props.dispatcher.rerequestCheckSuite(
        this.props.repository.gitHubRepository,
        id
      )
    }

    this.props.onDismissed()
  }

  private async loadCheckRunLogs() {
    const { pullRequest, repository } = this.props
    const { gitHubRepository } = repository

    const account = this.props.accounts.find(
      a => a.endpoint === gitHubRepository.endpoint
    )

    if (account === undefined) {
      this.setState({
        loadingActionWorkflows: false,
        loadingActionLogs: false,
      })
      return
    }

    const api = API.fromAccount(account)

    /*
      Until we retrieve the actions workflows, we don't know if a check run has
      action logs to output, thus, we want to show loading until then. However,
      once the workflows have been retrieved and since the logs retrieval and
      parsing can be noticeably time consuming. We go ahead and flip a flag so
      that we know we can go ahead and display the checkrun `output` content if
      a check run does not have action logs to retrieve/parse.
    */
    const checkRunsWithActionsUrls = await getCheckRunActionsJobsAndLogURLS(
      api,
      gitHubRepository.owner.login,
      gitHubRepository.name,
      pullRequest.head.ref,
      this.props.checks
    )

    if (this.checkRunsLoadCancelled) {
      return
    }

    this.setState({
      checks: checkRunsWithActionsUrls,
      loadingActionWorkflows: false,
    })

    const checks = await getLatestPRWorkflowRunsLogsForCheckRun(
      api,
      gitHubRepository.owner.login,
      gitHubRepository.name,
      checkRunsWithActionsUrls
    )

    if (this.checkRunsLoadCancelled) {
      return
    }

    this.setState({ checks, loadingActionLogs: false })
  }

  private onCheckRunClick = (checkRun: IRefCheck): void => {
    this.setState({ selectedCheckID: checkRun.id })
  }

  private onViewOnGitHub = (checkRun: IRefCheck) => {
    const { repository, pullRequest, dispatcher } = this.props

    // Some checks do not provide htmlURLS like ones for the legacy status
    // object as they do not have a view in the checks screen. In that case we
    // will just open the PR and they can navigate from there... a little
    // dissatisfying tho more of an edgecase anyways.
    const url =
      checkRun.htmlUrl ??
      `${repository.gitHubRepository.htmlURL}/pull/${pullRequest.pullRequestNumber}`
    if (url === null) {
      // The repository should have a htmlURL.
      return
    }
    dispatcher.openInBrowser(url)
  }

  private onSubmit = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const { dispatcher, repository, pullRequest } = this.props

    this.setState({ switchingToPullRequest: true })
    await dispatcher.selectRepository(repository)
    await dispatcher.checkoutPullRequest(repository, pullRequest)
    this.setState({ switchingToPullRequest: false })

    this.props.onDismissed()
  }
}
