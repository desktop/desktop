import * as React from 'react'
import { GitHubRepository } from '../../models/github-repository'
import { IDisposable } from 'event-kit'
import { Dispatcher } from '../dispatcher'
import {
  getCheckRunConclusionAdjective,
  ICombinedRefCheck,
  IRefCheck,
} from '../../lib/stores/commit-status-store'
import { Octicon, syncClockwise } from '../octicons'
import _ from 'lodash'
import { Button } from '../lib/button'
import { CICheckRunListItem } from './ci-check-list-item'
import * as OcticonSymbol from '../octicons/octicons.generated'

interface ICICheckRunListProps {
  /** The classname for the underlying element. */
  readonly className?: string

  readonly dispatcher: Dispatcher

  /** The GitHub repository to use when looking up commit status. */
  readonly repository: GitHubRepository

  /** The current branch name. */
  readonly branchName: string

  /** The pull request's number. */
  readonly prNumber: number
}

interface ICICheckRunListState {
  readonly checkRuns: ReadonlyArray<IRefCheck>
  readonly checkRunSummary: string
  readonly checkRunsShown: string | null
  readonly checkRunLogsShown: string | null
  readonly loadingLogs: boolean
}

/** The CI Check list. */
export class CICheckRunList extends React.PureComponent<
  ICICheckRunListProps,
  ICICheckRunListState
> {
  private statusSubscription: IDisposable | null = null

  public constructor(props: ICICheckRunListProps) {
    super(props)

    const combinedCheck = props.dispatcher.tryGetCommitStatus(
      this.props.repository,
      this.getCommitRef(this.props.prNumber)
    )

    this.state = {
      checkRuns: combinedCheck !== null ? combinedCheck.checks : [],
      checkRunSummary: this.getCombinedCheckSummary(combinedCheck),
      checkRunsShown: null,
      checkRunLogsShown: null,
      loadingLogs: true,
    }

    this.onStatus(combinedCheck)
  }

  public componentDidUpdate(prevProps: ICICheckRunListProps) {
    // Re-subscribe if we're being reused to show a different status.
    if (
      this.props.repository.hash !== prevProps.repository.hash ||
      this.getCommitRef(this.props.prNumber) !==
        this.getCommitRef(prevProps.prNumber)
    ) {
      const combinedCheck = this.props.dispatcher.tryGetCommitStatus(
        this.props.repository,
        this.getCommitRef(this.props.prNumber)
      )

      this.setState({
        checkRuns: combinedCheck !== null ? combinedCheck.checks : [],
      })
      this.subscribe()
    }
  }

  public componentDidMount() {
    this.subscribe()
  }

  public componentWillUnmount() {
    this.unsubscribe()
  }

  private subscribe() {
    this.unsubscribe()

    this.statusSubscription = this.props.dispatcher.subscribeToCommitStatus(
      this.props.repository,
      this.getCommitRef(this.props.prNumber),
      this.onStatus
    )
  }

  private unsubscribe() {
    if (this.statusSubscription) {
      this.statusSubscription.dispose()
      this.statusSubscription = null
    }
  }

  private onStatus = async (check: ICombinedRefCheck | null) => {
    const statusChecks = check !== null ? check.checks : []

    const checkRuns =
      statusChecks.length > 0
        ? await this.props.dispatcher.getActionsWorkflowRunLogs(
            this.props.repository,
            this.getCommitRef(this.props.prNumber),
            this.props.branchName,
            statusChecks
          )
        : statusChecks

    this.setState({
      checkRuns,
      loadingLogs: false,
      checkRunSummary: this.getCombinedCheckSummary(check),
    })
  }

  private viewCheckRunsOnGitHub = (checkRun: IRefCheck): void => {
    // Some checks do not provide htmlURLS like ones for the legacy status
    // object as they do not have a view in the checks screen. In that case we
    // will just open the PR and they can navigate from there... a little
    // dissatisfying tho more of an edgecase anyways.
    const url =
      checkRun.htmlUrl ??
      `${this.props.repository.htmlURL}/pull/${this.props.prNumber}`
    if (url === null) {
      // The repository should have a htmlURL.
      return
    }
    this.props.dispatcher.openInBrowser(url)
  }

  private onCheckRunClick = (checkRun: IRefCheck): void => {
    this.setState({
      checkRunLogsShown:
        this.state.checkRunLogsShown === checkRun.id.toString()
          ? null
          : checkRun.id.toString(),
    })
  }

  private getCommitRef(prNumber: number): string {
    return `refs/pull/${prNumber}/head`
  }

  private getCombinedCheckSummary(
    combinedCheck: ICombinedRefCheck | null
  ): string {
    if (combinedCheck === null || combinedCheck.checks.length === 0) {
      return ''
    }

    const { checks } = combinedCheck
    const conclusionMap = new Map<string, number>()
    for (const check of checks) {
      const adj = getCheckRunConclusionAdjective(
        check.conclusion
      ).toLocaleLowerCase()
      conclusionMap.set(adj, (conclusionMap.get(adj) ?? 0) + 1)
    }

    const summaryArray = []
    for (const [conclusion, count] of conclusionMap.entries()) {
      summaryArray.push(`${count} ${conclusion}`)
    }

    if (summaryArray.length > 1) {
      return `${summaryArray.slice(0, -1).join(', ')}, and ${summaryArray.slice(
        -1
      )} checks`
    }

    return `${summaryArray[0]} check`
  }

  private rerunJobs = () => {
    // TODO: Rerun jobs
  }

  private onAppHeaderClick = (appName: string) => {
    return () => {
      this.setState({
        checkRunsShown: this.state.checkRunsShown === appName ? '' : appName,
      })
    }
  }

  private renderList = (checks: ReadonlyArray<IRefCheck>) => {
    const list = checks.map((c, i) => {
      return (
        <CICheckRunListItem
          key={i}
          checkRun={c}
          loadingLogs={this.state.loadingLogs}
          showLogs={this.state.checkRunLogsShown === c.id.toString()}
          onCheckRunClick={this.onCheckRunClick}
          onViewOnGitHub={this.viewCheckRunsOnGitHub}
        />
      )
    })

    return <>{list}</>
  }

  private renderRerunButton = () => {
    const { checkRuns } = this.state
    return (
      <div className="ci-check-rerun">
        <Button onClick={this.rerunJobs} disabled={checkRuns.length === 0}>
          <Octicon symbol={syncClockwise} /> Re-run jobs
        </Button>
      </div>
    )
  }

  public render() {
    const { checkRuns, checkRunsShown, checkRunSummary } = this.state

    const checksByApp = _.groupBy(checkRuns, 'appName')
    const appNames = Object.keys(checksByApp).sort(
      (a, b) => b.length - a.length
    )

    const appNameShown = checkRunsShown !== null ? checkRunsShown : appNames[0]

    const checkLists = appNames.map((appName: string, index: number) => {
      const displayAppName = appName !== '' ? appName : 'Other'
      return (
        <div className="ci-check-app-list" key={displayAppName}>
          <div
            className="ci-check-app-header"
            onClick={this.onAppHeaderClick(displayAppName)}
          >
            <Octicon
              className="open-closed-icon"
              symbol={
                appNameShown === displayAppName
                  ? OcticonSymbol.chevronDown
                  : OcticonSymbol.chevronRight
              }
            />
            <div className="ci-check-app-name">{displayAppName}</div>
          </div>
          {appNameShown === displayAppName
            ? this.renderList(checksByApp[appName])
            : null}
        </div>
      )
    })

    return (
      <div className="ci-check-run-list">
        <div className="ci-check-run-list-header">
          <div className="ci-check-run-list-title-container">
            <div className="title">Checks Summary</div>
            <div className="check-run-list-summary">{checkRunSummary}</div>
          </div>
          {this.renderRerunButton()}
        </div>
        {checkRuns.length !== 0 ? checkLists : 'Unable to load checks runs.'}
      </div>
    )
  }
}
