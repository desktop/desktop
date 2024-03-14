import * as React from 'react'
import { GitHubRepository } from '../../models/github-repository'
import { DisposableLike } from 'event-kit'
import { Dispatcher } from '../dispatcher'
import {
  getCheckRunConclusionAdjective,
  ICombinedRefCheck,
  IRefCheck,
  getCheckRunStepURL,
  getCheckStatusCountMap,
  FailingCheckConclusions,
} from '../../lib/ci-checks/ci-checks'
import { Octicon, syncClockwise } from '../octicons'
import {
  APICheckConclusion,
  APICheckStatus,
  IAPIWorkflowJobStep,
} from '../../lib/api'
import {
  Popover,
  PopoverAnchorPosition,
  PopoverDecoration,
} from '../lib/popover'
import { CICheckRunList } from './ci-check-run-list'
import { encodePathAsUrl } from '../../lib/path'
import { PopupType } from '../../models/popup'
import * as octicons from '../octicons/octicons.generated'
import { Donut } from '../donut'
import {
  supportsRerunningChecks,
  supportsRerunningIndividualOrFailedChecks,
} from '../../lib/endpoint-capabilities'
import { getPullRequestCommitRef } from '../../models/pull-request'
import { CICheckReRunButton } from './ci-check-re-run-button'
import groupBy from 'lodash/groupBy'
import { toSentence } from '../../lib/to_sentence'

const BlankSlateImage = encodePathAsUrl(
  __dirname,
  'static/empty-no-pull-requests.svg'
)

export function getCombinedStatusSummary(
  statusHolders: ReadonlyArray<{ conclusion: APICheckConclusion | null }>,
  description?: 'check' | 'step'
): string {
  const conclusions = Object.values(groupBy(statusHolders, 'conclusion')).map(
    g =>
      `${g.length} ${getCheckRunConclusionAdjective(
        g[0].conclusion
      ).toLocaleLowerCase()}`
  )

  const pluralize = statusHolders.length > 1 ? `${description}s` : description
  return `${toSentence(conclusions)} ${pluralize}`
}

interface ICICheckRunPopoverProps {
  readonly dispatcher: Dispatcher

  /** The GitHub repository to use when looking up commit status. */
  readonly repository: GitHubRepository

  /** The current branch name. */
  readonly branchName: string

  /** The pull request's number. */
  readonly prNumber: number

  readonly anchor: HTMLElement | null

  /** Callback for when popover closes */
  readonly closePopover: (event?: MouseEvent) => void
}

interface ICICheckRunPopoverState {
  readonly checkRuns: ReadonlyArray<IRefCheck>
  readonly checkRunSummary: string
  readonly loadingActionWorkflows: boolean
}

/** The CI Check Runs Popover. */
export class CICheckRunPopover extends React.PureComponent<
  ICICheckRunPopoverProps,
  ICICheckRunPopoverState
> {
  private statusSubscription: DisposableLike | null = null

  public constructor(props: ICICheckRunPopoverProps) {
    super(props)

    const cachedStatus = this.props.dispatcher.tryGetCommitStatus(
      this.props.repository,
      getPullRequestCommitRef(this.props.prNumber)
    )

    this.state = {
      checkRuns: cachedStatus?.checks ?? [],
      checkRunSummary: this.getCombinedCheckSummary(cachedStatus),
      loadingActionWorkflows: true,
    }
  }

  public componentDidMount() {
    const combinedCheck = this.props.dispatcher.tryGetCommitStatus(
      this.props.repository,
      getPullRequestCommitRef(this.props.prNumber),
      this.props.branchName
    )

    this.onStatus(combinedCheck)
    this.subscribe()
  }

  public componentWillUnmount() {
    this.unsubscribe()
  }

  private subscribe() {
    this.unsubscribe()

    this.statusSubscription = this.props.dispatcher.subscribeToCommitStatus(
      this.props.repository,
      getPullRequestCommitRef(this.props.prNumber),
      this.onStatus,
      this.props.branchName
    )
  }

  private unsubscribe() {
    if (this.statusSubscription) {
      this.statusSubscription.dispose()
      this.statusSubscription = null
    }
  }

  private onStatus = async (check: ICombinedRefCheck | null) => {
    if (check === null) {
      // Either this is on load -> we just want to continue to show loader
      // status/cached header or while user has it open and we ant to continue
      // to show last cache value to user closes popover
      return
    }

    this.setState({
      checkRuns: [...check.checks],
      checkRunSummary: this.getCombinedCheckSummary(check),
      loadingActionWorkflows: false,
    })
  }

  private onViewCheckDetails = (checkRun: IRefCheck): void => {
    if (checkRun.htmlUrl === null && this.props.repository.htmlURL === null) {
      // A check run may not have a url depending on how it is setup.
      // However, the repository should have one; Thus, we shouldn't hit this
      return
    }

    // Some checks do not provide htmlURLS like ones for the legacy status
    // object as they do not have a view in the checks screen. In that case we
    // will just open the PR and they can navigate from there... a little
    // dissatisfying tho more of an edgecase anyways.
    const url =
      checkRun.htmlUrl ??
      `${this.props.repository.htmlURL}/pull/${this.props.prNumber}`

    this.props.dispatcher.openInBrowser(url)
    this.props.dispatcher.incrementMetric('viewsCheckOnline')
  }

  private onViewJobStep = (
    checkRun: IRefCheck,
    step: IAPIWorkflowJobStep
  ): void => {
    const { repository, prNumber, dispatcher } = this.props

    const url = getCheckRunStepURL(checkRun, step, repository, prNumber)

    if (url !== null) {
      dispatcher.openInBrowser(url)
      this.props.dispatcher.incrementMetric('viewsCheckJobStepOnline')
    }
  }

  private getCombinedCheckSummary(
    combinedCheck: ICombinedRefCheck | null
  ): string {
    if (combinedCheck === null || combinedCheck.checks.length === 0) {
      return ''
    }
    return getCombinedStatusSummary(combinedCheck.checks, 'check')
  }

  private rerunChecks = (
    failedOnly: boolean,
    checkRuns?: ReadonlyArray<IRefCheck>
  ) => {
    this.props.dispatcher.showPopup({
      type: PopupType.CICheckRunRerun,
      checkRuns: checkRuns ?? this.state.checkRuns,
      repository: this.props.repository,
      prRef: getPullRequestCommitRef(this.props.prNumber),
      failedOnly,
    })
  }

  private renderRerunButton = () => {
    const { checkRuns } = this.state
    if (!supportsRerunningChecks(this.props.repository.endpoint)) {
      return null
    }

    return (
      <CICheckReRunButton
        disabled={checkRuns.length === 0 || this.state.loadingActionWorkflows}
        checkRuns={checkRuns}
        canReRunFailed={supportsRerunningIndividualOrFailedChecks(
          this.props.repository.endpoint
        )}
        onRerunChecks={this.rerunChecks}
      />
    )
  }

  private renderCheckRunLoadings(): JSX.Element {
    return (
      <div className="loading-check-runs">
        <img src={BlankSlateImage} className="blankslate-image" alt="" />
        <div className="title">Stand By</div>
        <div className="call-to-action">Check runs incoming!</div>
      </div>
    )
  }

  private renderCompletenessIndicator(
    allSuccess: boolean,
    allFailure: boolean,
    loading: boolean,
    checkRuns: ReadonlyArray<IRefCheck>
  ): JSX.Element {
    if (loading) {
      return <Octicon symbol={syncClockwise} className="spin" />
    }

    switch (true) {
      case allSuccess:
        return (
          <Octicon
            className={'completeness-indicator-success'}
            symbol={octicons.checkCircleFill}
          />
        )
      case allFailure: {
        return (
          <Octicon
            className={'completeness-indicator-error'}
            symbol={octicons.xCircleFill}
          />
        )
      }
    }

    const valueMap = getCheckStatusCountMap(checkRuns)

    const ariaLabel = `Completeness indicator. ${
      valueMap.get(APICheckStatus.Completed) ?? 0
    } completed, ${valueMap.get(APICheckStatus.InProgress) ?? 0} in progress, ${
      valueMap.get(APICheckStatus.Queued) ?? 0
    } queued.`

    return <Donut ariaLabel={ariaLabel} valueMap={valueMap} />
  }

  private getTitle(
    allSuccess: boolean,
    allFailure: boolean,
    somePendingNoFailures: boolean,
    loading: boolean
  ): JSX.Element {
    switch (true) {
      case loading:
        return <>Checks Summary</>
      case somePendingNoFailures:
        return (
          <span className="pending">Some checks haven't completed yet</span>
        )
      case allFailure:
        return <span className="failure">All checks have failed</span>
      case allSuccess:
        return <>All checks have passed</>
    }

    return <span className="failure">Some checks were not successful</span>
  }

  private renderHeader = (): JSX.Element => {
    const { loadingActionWorkflows, checkRuns, checkRunSummary } = this.state
    // Only show loading header status, if there are no cached check runs to display.
    const loading = loadingActionWorkflows && checkRuns.length === 0

    const somePendingNoFailures =
      !loading &&
      checkRuns.some(v => v.conclusion === null) &&
      !checkRuns.some(
        v =>
          v.conclusion !== null &&
          FailingCheckConclusions.includes(v.conclusion)
      )

    const successfulishConclusions = [
      APICheckConclusion.Success,
      APICheckConclusion.Neutral,
      APICheckConclusion.Skipped,
    ]
    const allSuccessIsh =
      !loading && // quick return: if loading, no list
      !somePendingNoFailures && // quick return: if some pending, can't all be success
      !checkRuns.some(
        v =>
          v.conclusion !== null &&
          !successfulishConclusions.includes(v.conclusion)
      )

    const allFailure =
      !loading && // quick return if loading, no list
      !somePendingNoFailures && // quick return: if some failing, can't all be failure
      !checkRuns.some(
        v =>
          v.conclusion === null ||
          !FailingCheckConclusions.includes(v.conclusion)
      )

    return (
      <div className="ci-check-run-list-header">
        <div className="completeness-indicator">
          {this.renderCompletenessIndicator(
            allSuccessIsh,
            allFailure,
            loading,
            checkRuns
          )}
        </div>
        <div className="ci-check-run-list-title-container">
          <h1 id="ci-check-run-header" className="title">
            {this.getTitle(
              allSuccessIsh,
              allFailure,
              somePendingNoFailures,
              loading
            )}
          </h1>
          <div className="check-run-list-summary">{checkRunSummary}</div>
        </div>
        {this.renderRerunButton()}
      </div>
    )
  }

  private onRerunJob = (check: IRefCheck) => {
    this.rerunChecks(false, [check])
  }

  public renderList = (): JSX.Element => {
    const { checkRuns, loadingActionWorkflows } = this.state
    if (loadingActionWorkflows) {
      return this.renderCheckRunLoadings()
    }

    return (
      <div className="ci-check-run-list-container">
        <CICheckRunList
          checkRuns={checkRuns}
          onViewCheckDetails={this.onViewCheckDetails}
          onViewJobStep={this.onViewJobStep}
          onRerunJob={
            supportsRerunningIndividualOrFailedChecks(
              this.props.repository.endpoint
            )
              ? this.onRerunJob
              : undefined
          }
        />
      </div>
    )
  }

  public render() {
    return (
      <div className="ci-check-list-popover">
        <Popover
          anchor={this.props.anchor}
          anchorPosition={PopoverAnchorPosition.Bottom}
          decoration={PopoverDecoration.Balloon}
          ariaLabelledby="ci-check-run-header"
          onClickOutside={this.props.closePopover}
        >
          <div className="ci-check-run-list-wrapper">
            {this.renderHeader()}
            {this.renderList()}
          </div>
        </Popover>
      </div>
    )
  }
}
