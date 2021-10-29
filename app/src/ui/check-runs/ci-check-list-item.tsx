import * as React from 'react'
import { IRefCheck } from '../../lib/ci-checks/ci-checks'
import { Octicon } from '../octicons'
import { getClassNameForCheck, getSymbolForCheck } from '../branches/ci-status'
import classNames from 'classnames'
import { CICheckRunLogs } from './ci-check-run-item-logs'

interface ICICheckRunListItemProps {
  /** The check run to display **/
  readonly checkRun: IRefCheck

  /** Whether call for actions logs is pending */
  readonly loadingActionLogs: boolean

  /** Whether tcall for actions workflows is pending */
  readonly loadingActionWorkflows: boolean

  /** Whether to show the logs for this check run */
  readonly showLogs: boolean

  /** Whether the list item is selected */
  readonly selected: boolean

  /** The base href used for relative links provided in check run markdown
   * output */
  readonly baseHref: string | null

  /** Callback for when a check run is clicked */
  readonly onCheckRunClick: (checkRun: IRefCheck) => void

  /** Callback to opens check runs on GitHub */
  readonly onViewOnGitHub: (checkRun: IRefCheck) => void
}

/** The CI check list item. */
export class CICheckRunListItem extends React.PureComponent<
  ICICheckRunListItemProps
> {
  private onCheckRunClick = () => {
    this.props.onCheckRunClick(this.props.checkRun)
  }

  private onViewOnGitHub = () => {
    this.props.onViewOnGitHub(this.props.checkRun)
  }

  public render() {
    const { checkRun, showLogs, loadingActionLogs, baseHref } = this.props

    return (
      <>
        <div
          className={classNames('ci-check-list-item list-item', {
            selected: this.props.selected,
          })}
          tabIndex={0}
          onClick={this.onCheckRunClick}
        >
          <div className="ci-check-status-symbol">
            <Octicon
              className={classNames(
                'ci-status',
                `ci-status-${getClassNameForCheck(checkRun)}`
              )}
              symbol={getSymbolForCheck(checkRun)}
              title={checkRun.description}
            />
          </div>

          <div className="ci-check-list-item-detail">
            <div className="ci-check-name">{checkRun.name}</div>
            <div className="ci-check-description" title={checkRun.description}>
              {checkRun.description}
            </div>
          </div>
        </div>
        {showLogs ? (
          <CICheckRunLogs
            checkRun={checkRun}
            baseHref={baseHref}
            loadingActionLogs={loadingActionLogs}
            loadingActionWorkflows={loadingActionLogs}
            onViewOnGitHub={this.onViewOnGitHub}
          />
        ) : null}
      </>
    )
  }
}
