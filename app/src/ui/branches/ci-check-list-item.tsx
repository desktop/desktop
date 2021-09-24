import * as React from 'react'
import {
  getCheckDurationInSeconds,
  IRefCheck,
  IRefCheckOutput,
  RefCheckOutputType,
} from '../../lib/stores/commit-status-store'

import { Octicon } from '../octicons'
import { getClassNameForCheck, getSymbolForCheck } from './ci-status'
import classNames from 'classnames'
import { APICheckConclusion } from '../../lib/api'

interface ICICheckRunListItemProps {
  /** The check run to display **/
  readonly checkRun: IRefCheck

  /** Whether call for actions logs is pending */
  readonly loadingLogs: boolean

  /** Whether to show the logs for this check run */
  readonly showLogs: boolean

  /** Callback for when a check run is clicked */
  readonly onCheckRunClick: (checkRun: IRefCheck) => void
}

/** The CI check list item. */
export class CICheckRunListItem extends React.PureComponent<
  ICICheckRunListItemProps
> {
  public onCheckRunClick = () => {
    this.props.onCheckRunClick(this.props.checkRun)
  }

  private renderActionsLogOutput = (output: IRefCheckOutput) => {
    if (output.type === RefCheckOutputType.Default) {
      return null
    }

    return output.steps.map((step, i) => {
      const header = (
        <div className="ci-check-run-log-step" key={i}>
          <div className="ci-check-status-symbol">
            <Octicon
              className={classNames(
                'ci-status',
                `ci-status-${getClassNameForCheck(step)}`
              )}
              symbol={getSymbolForCheck(step)}
              title={step.name}
            />
          </div>
          <div className="ci-check-run-log-step-name">{step.name}</div>
          <div>{getCheckDurationInSeconds(step)}s</div>
        </div>
      )

      const log =
        step.conclusion === APICheckConclusion.Failure ? step.log : null

      return (
        <>
          {header}
          {log}
        </>
      )
    })
  }

  private renderNonActionsLogOutput = (output: IRefCheckOutput) => {
    if (output.type === RefCheckOutputType.Actions) {
      return null
    }

    let logOutput: JSX.Element[] = []

    const isNoProvidedOutput = output.text === null || output.text.trim() === ''

    if (this.props.loadingLogs && isNoProvidedOutput) {
      return <p>Loading Logs... please wait.. need empty graphic...</p>
    }

    logOutput.push(
      isNoProvidedOutput ? (
        this.renderEmptyLogOutput()
      ) : (
        <div dangerouslySetInnerHTML={{ __html: output.text }}></div>
      )
    )
    return logOutput
  }

  private renderEmptyLogOutput = () => {
    return (
      <div className="no-logs-to-display">
        No additional information to display.
      </div>
    )
  }

  private renderLoadingLogs = () => {
    // TODO: Need empty graphic... like for loading PR's
    return <p>Loading Logs... please wait.. </p>
  }

  private renderLogs = () => {
    const {
      loadingLogs,
      checkRun: { output },
    } = this.props

    const isNoProvidedOutput =
      output.type === RefCheckOutputType.Default &&
      (output.text === null || output.text.trim() === '')

    if (loadingLogs && isNoProvidedOutput) {
      return this.renderLoadingLogs()
    }

    return (
      <div className="ci-check-list-item-logs">
        {this.renderActionsLogOutput(output)}
        {this.renderNonActionsLogOutput(output)}
      </div>
    )
  }

  public render() {
    const { checkRun, showLogs } = this.props

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
        {showLogs ? this.renderLogs() : null}
      </>
    )
  }
}
