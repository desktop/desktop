import * as React from 'react'
import { IRefCheck } from '../../lib/stores/commit-status-store'

import { Octicon } from '../octicons'
import { getClassNameForCheck, getSymbolForCheck } from './ci-status'
import classNames from 'classnames'

import { CICheckRunListItemLogs } from './ci-check-list-item-logs'

interface ICICheckRunListItemProps {
  /** The check run to display **/
  readonly checkRun: IRefCheck

  /** Whether call for actions logs is pending */
  readonly loadingLogs: boolean

  /** Whether to show the logs for this check run */
  readonly showLogs: boolean

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
    const { checkRun, showLogs, loadingLogs } = this.props

    return (
      <>
        <div
          className="ci-check-list-item list-item"
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
          <CICheckRunListItemLogs
            checkRun={checkRun}
            loadingLogs={loadingLogs}
            onViewOnGitHub={this.onViewOnGitHub}
          />
        ) : null}
      </>
    )
  }
}
