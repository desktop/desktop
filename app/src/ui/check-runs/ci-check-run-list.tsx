import * as React from 'react'
import { IRefCheck, isFailure } from '../../lib/ci-checks/ci-checks'
import { Octicon } from '../octicons'
import _ from 'lodash'
import { CICheckRunListItem } from './ci-check-run-list-item'
import * as OcticonSymbol from '../octicons/octicons.generated'

interface ICICheckRunListProps {
  /** List of check runs to display */
  readonly checkRuns: ReadonlyArray<IRefCheck>

  /** Whether loading action logs */
  readonly loadingActionLogs: boolean

  /** Whether loading workflow  */
  readonly loadingActionWorkflows: boolean

  /** The base href used for relative links provided in check run markdown
   * output */
  readonly baseHref: string | null

  /** Callback to opens check runs on GitHub */
  readonly onViewOnGitHub: (checkRun: IRefCheck) => void

  /** Callback to open URL's originating from markdown */
  readonly onMarkdownLinkClicked: (url: string) => void
}

interface ICICheckRunListState {
  readonly checkRunsShown: string | null
  readonly checkRunLogsShown: string | null
  readonly checksByApp: _.Dictionary<IRefCheck[]>
  readonly appNames: ReadonlyArray<string>
}

/** The CI Check list. */
export class CICheckRunList extends React.PureComponent<
  ICICheckRunListProps,
  ICICheckRunListState
> {
  public constructor(props: ICICheckRunListProps) {
    super(props)

    this.state = this.setupStateAfterCheckRunPropChange(props)
  }

  public componentDidUpdate(prevProps: ICICheckRunListProps) {
    // Currently, this updates if we retreive from api, thus memory ref check is
    // appropriate.
    if (prevProps.checkRuns === this.props.checkRuns) {
      return
    }

    this.setState(this.setupStateAfterCheckRunPropChange(this.props))
  }

  private setupStateAfterCheckRunPropChange(
    props: ICICheckRunListProps
  ): ICICheckRunListState {
    const checksByApp = _.groupBy(props.checkRuns, 'appName')
    if (checksByApp[''] !== undefined) {
      checksByApp['Other'] = checksByApp['']
      delete checksByApp['']
    }
    const appNames = this.getSortedAppNames(checksByApp)

    let checkRunLogsShown = null
    // If there is a failure, we want the first app and first check run with a
    // failure, to be opened so the user doesn't have to click through to find
    // it.
    const firstFailureAppName = appNames.find(an => {
      checkRunLogsShown = checksByApp[an].find(isFailure)?.id.toString() ?? null
      return checkRunLogsShown !== null
    })

    // If there are no failures, just show the first app open. Let user pick
    // which logs they would like look it. (checkRunLogsShown = null)
    const checkRunsShown =
      firstFailureAppName !== undefined ? firstFailureAppName : appNames[0]

    return {
      checkRunsShown,
      checkRunLogsShown,
      checksByApp,
      appNames,
    }
  }

  private getSortedAppNames(checksByApp: _.Dictionary<IRefCheck[]>): string[] {
    return Object.keys(checksByApp)
      .sort((a, b) => b.length - a.length)
      .map(name => (name !== '' ? name : 'Other'))
  }

  private onCheckRunClick = (checkRun: IRefCheck): void => {
    this.setState({
      checkRunLogsShown:
        this.state.checkRunLogsShown === checkRun.id.toString()
          ? null
          : checkRun.id.toString(),
    })
  }

  private onAppHeaderClick = (appName: string) => {
    return () => {
      this.setState({
        checkRunsShown: this.state.checkRunsShown === appName ? '' : appName,
      })
    }
  }

  private renderList = (appName: string): JSX.Element | null => {
    const { checkRunsShown, checksByApp } = this.state
    if (checkRunsShown !== appName) {
      return null
    }

    const list = checksByApp[appName].map((c, i) => {
      return (
        <CICheckRunListItem
          key={i}
          checkRun={c}
          baseHref={this.props.baseHref}
          loadingActionLogs={this.props.loadingActionLogs}
          loadingActionWorkflows={this.props.loadingActionWorkflows}
          showLogs={this.state.checkRunLogsShown === c.id.toString()}
          onCheckRunClick={this.onCheckRunClick}
          onViewOnGitHub={this.props.onViewOnGitHub}
          onMarkdownLinkClicked={this.props.onMarkdownLinkClicked}
        />
      )
    })

    return <>{list}</>
  }

  private renderCheckAppHeader = (appName: string): JSX.Element => {
    const { checkRunsShown } = this.state

    return (
      <div
        className="ci-check-app-header"
        onClick={this.onAppHeaderClick(appName)}
      >
        <Octicon
          className="open-closed-icon"
          symbol={
            checkRunsShown === appName
              ? OcticonSymbol.chevronDown
              : OcticonSymbol.chevronRight
          }
        />
        <div className="ci-check-app-name">{appName}</div>
      </div>
    )
  }

  public render() {
    const { appNames } = this.state

    const checkLists = appNames.map(appName => (
      <div className="ci-check-app-list" key={appName}>
        {this.renderCheckAppHeader(appName)}
        {this.renderList(appName)}
      </div>
    ))

    return <div className="ci-check-run-list">{checkLists}</div>
  }
}
