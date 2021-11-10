import * as React from 'react'
import { IRefCheck } from '../../lib/ci-checks/ci-checks'
import classNames from 'classnames'
import { CICheckRunActionLogs } from './ci-check-run-actions-logs'

interface ICICheckRunLogsProps {
  /** The check run to display **/
  readonly checkRun: IRefCheck

  /** The base href used for relative links provided in check run markdown
   * output */
  readonly baseHref: string | null

  /** Callback to opens check runs on GitHub */
  readonly onMouseOver: (mouseEvent: React.MouseEvent<HTMLDivElement>) => void

  /** Callback to opens check runs on GitHub */
  readonly onMouseLeave: (mouseEvent: React.MouseEvent<HTMLDivElement>) => void

  /** Callback to open URL's originating from markdown */
  readonly onMarkdownLinkClicked: (url: string) => void

  /** Callback to open check run target url (maybe GitHub, maybe third party check run)*/
  readonly onViewCheckDetails: () => void
}

/** The CI check list item. */
export class CICheckRunLogs extends React.PureComponent<ICICheckRunLogsProps> {
  public render() {
    const {
      checkRun: { actionJobSteps },
    } = this.props

    if (actionJobSteps === undefined) {
      return
    }

    const className = classNames('ci-check-list-item-logs', 'actions')

    return (
      <div
        className={className}
        onMouseOver={this.props.onMouseOver}
        onMouseLeave={this.props.onMouseLeave}
      >
        <div className="ci-check-list-item-logs-output">
          <CICheckRunActionLogs actionSteps={actionJobSteps} />
        </div>
      </div>
    )
  }
}
