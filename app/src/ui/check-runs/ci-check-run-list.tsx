import * as React from 'react'
import { IRefCheck } from '../../lib/ci-checks/ci-checks'
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
}

/** The CI Check list. */
export class CICheckRunList extends React.PureComponent<
  ICICheckRunListProps,
  ICICheckRunListState
> {
  public constructor(props: ICICheckRunListProps) {
    super(props)

    this.state = {
      checkRunsShown: null,
      checkRunLogsShown: null,
    }
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

  private renderList = (checks: ReadonlyArray<IRefCheck>) => {
    const list = checks.map((c, i) => {
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
