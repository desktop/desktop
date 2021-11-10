import * as React from 'react'
import { IRefCheck } from '../../lib/ci-checks/ci-checks'
import { Octicon } from '../octicons'
import { getClassNameForCheck, getSymbolForCheck } from '../branches/ci-status'
import classNames from 'classnames'
import { CICheckRunLogs } from './ci-check-run-logs'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { TooltippedContent } from '../lib/tooltipped-content'

interface ICICheckRunListItemProps {
  /** The check run to display **/
  readonly checkRun: IRefCheck

  /** Whether call for actions logs is pending */
  readonly loadingActionLogs: boolean

  /** Whether tcall for actions workflows is pending */
  readonly loadingActionWorkflows: boolean

  /** Whether to show the logs for this check run */
  readonly showLogs: boolean

  /** The base href used for relative links provided in check run markdown
   * output */
  readonly baseHref: string | null

  /** Callback for when a check run is clicked */
  readonly onCheckRunClick: (checkRun: IRefCheck) => void

  /** Callback to opens check runs target url (maybe GitHub, maybe third party) */
  readonly onViewCheckDetails: (checkRun: IRefCheck) => void

  /** Callback to open URL's originating from markdown */
  readonly onMarkdownLinkClicked: (url: string) => void
}

interface ICICheckRunListItemState {
  readonly isMouseOverLogs: boolean
}

/** The CI check list item. */
export class CICheckRunListItem extends React.PureComponent<
  ICICheckRunListItemProps,
  ICICheckRunListItemState
> {
  public constructor(props: ICICheckRunListItemProps) {
    super(props)
    this.state = {
      isMouseOverLogs: false,
    }
  }

  private onCheckRunClick = () => {
    this.props.onCheckRunClick(this.props.checkRun)
  }

  private onViewCheckDetails = (e?: React.MouseEvent<HTMLDivElement>) => {
    e?.stopPropagation()
    this.props.onViewCheckDetails(this.props.checkRun)
  }

  private onMouseOverLogs = () => {
    this.setState({ isMouseOverLogs: true })
  }

  private onMouseLeaveLogs = () => {
    this.setState({ isMouseOverLogs: false })
  }

  private isLoading = (): boolean => {
    if (this.props.loadingActionLogs) {
      return true
    }

    if (
      this.props.loadingActionWorkflows &&
      this.props.checkRun.actionsWorkflowRunId !== undefined
    ) {
      return true
    }

    return false
  }

  private renderCheckStatusSymbol = (): JSX.Element => {
    const { checkRun, showLogs } = this.props

    const stepLoader = (
      <svg
        fill="none"
        height="16"
        viewBox="0 0 16 16"
        width="16"
        className="spin"
      >
        <g strokeWidth="2">
          <circle cx="8" cy="8" r="7" stroke="#959da5"></circle>
          <path
            d="m12.9497 3.05025c1.3128 1.31276 2.0503 3.09323 2.0503 4.94975 0 1.85651-.7375 3.637-2.0503 4.9497"
            stroke="#fafbfc"
          ></path>
        </g>
      </svg>
    )

    return (
      <div className="ci-check-status-symbol">
        {this.isLoading() && showLogs ? (
          stepLoader
        ) : (
          <Octicon
            className={classNames(
              'ci-status',
              `ci-status-${getClassNameForCheck(checkRun)}`
            )}
            symbol={getSymbolForCheck(checkRun)}
            title={checkRun.description}
          />
        )}
      </div>
    )
  }

  public render() {
    const { checkRun, showLogs, baseHref } = this.props

    return (
      <>
        <div
          className="ci-check-list-item list-item"
          onClick={this.onCheckRunClick}
        >
          {this.renderCheckStatusSymbol()}
          <div className="ci-check-list-item-detail">
            <TooltippedContent
              className="ci-check-name"
              tooltip={checkRun.name}
              onlyWhenOverflowed={true}
              tagName="div"
            >
              {checkRun.name}
            </TooltippedContent>

            <div className="ci-check-description">{checkRun.description}</div>
          </div>
          <div
            className={classNames('view-on-github', {
              show: this.state.isMouseOverLogs,
            })}
            onClick={this.onViewCheckDetails}
          >
            <Octicon
              symbol={OcticonSymbol.linkExternal}
              title="View on GitHub"
            />
          </div>
        </div>
        {showLogs && !this.isLoading() ? (
          <CICheckRunLogs
            checkRun={checkRun}
            baseHref={baseHref}
            onMouseOver={this.onMouseOverLogs}
            onMouseLeave={this.onMouseLeaveLogs}
            onMarkdownLinkClicked={this.props.onMarkdownLinkClicked}
            onViewCheckDetails={this.onViewCheckDetails}
          />
        ) : null}
      </>
    )
  }
}
