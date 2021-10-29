import * as React from 'react'
import { IRefCheck } from '../../lib/ci-checks/ci-checks'
import { Octicon } from '../octicons'
import _ from 'lodash'
import { CICheckRunListItem } from './ci-check-list-item'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { FocusContainer } from '../lib/focus-container'

interface ICICheckRunListProps {
  /** List of check runs to display */
  readonly checkRuns: ReadonlyArray<IRefCheck>

  /** Whether loading action logs */
  readonly loadingActionLogs: boolean

  /** Whether loading workflow  */
  readonly loadingActionWorkflows: boolean

  /** Whether show logs inline */
  readonly showLogsInline?: boolean

  /** Whether check runs can be selected. Default: false */
  readonly selectable?: boolean

  /** Selected check run, or null if none. */
  readonly selectedCheckRun?: IRefCheck | null

  /** The base href used for relative links provided in check run markdown
   * output */
  readonly baseHref: string | null

  /** Callback to opens check runs on GitHub */
  readonly onViewOnGitHub: (checkRun: IRefCheck) => void

  /** Callback when a check run is clicked */
  readonly onCheckRunClick?: (checkRun: IRefCheck) => void
}

interface ICICheckRunListState {
  readonly selectedCheckRun: IRefCheck | null
  readonly checkRunsShown: string | null
  readonly checkRunLogsShown: string | null
}

/** The CI Check list. */
export class CICheckRunList extends React.PureComponent<
  ICICheckRunListProps,
  ICICheckRunListState
> {
  public constructor(props: ICICheckRunListProps) {
    super(props)

    this.state = {
      selectedCheckRun: props.selectedCheckRun ?? null,
      checkRunsShown: props.selectedCheckRun?.appName ?? null,
      checkRunLogsShown: null,
    }
  }

  private onCheckRunClick = (checkRun: IRefCheck): void => {
    this.props.onCheckRunClick?.(checkRun)

    const shouldHideLogs =
      !this.canShowLogsInline ||
      this.state.checkRunLogsShown === checkRun.id.toString()

    const selectedCheckRun = this.props.selectable === true ? checkRun : null

    this.setState({
      selectedCheckRun,
      checkRunLogsShown: shouldHideLogs ? null : checkRun.id.toString(),
    })
  }

  private onAppHeaderClick = (appName: string) => {
    return () => {
      this.setState({
        checkRunsShown: this.state.checkRunsShown === appName ? '' : appName,
      })
    }
  }

  private get canShowLogsInline() {
    return this.props.showLogsInline !== false
  }

  private renderList = (checks: ReadonlyArray<IRefCheck>) => {
    const list = checks.map((c, i) => {
      return (
        <CICheckRunListItem
          key={i}
          checkRun={c}
          selected={this.state.selectedCheckRun?.id === c.id}
          baseHref={this.props.baseHref}
          loadingActionLogs={this.props.loadingActionLogs}
          loadingActionWorkflows={this.props.loadingActionWorkflows}
          showLogs={
            this.canShowLogsInline &&
            this.state.checkRunLogsShown === c.id.toString()
          }
          onCheckRunClick={this.onCheckRunClick}
          onViewOnGitHub={this.props.onViewOnGitHub}
        />
      )
    })

    return (
      <FocusContainer className="list-focus-container">{list}</FocusContainer>
    )
  }

  public render() {
    const { checkRunsShown } = this.state
    const { checkRuns } = this.props

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

    return <div className="ci-check-run-list">{checkLists}</div>
  }
}
