import * as React from 'react'
import {
  getFormattedCheckRunDuration,
  IRefCheckOutput,
  RefCheckOutputType,
} from '../../lib/stores/commit-status-store'

import { Octicon } from '../octicons'
import { getClassNameForLogStep, getSymbolForLogStep } from './ci-status'
import classNames from 'classnames'
import * as OcticonSymbol from '../octicons/octicons.generated'

interface ICICheckRunActionLogsProps {
  /** The check run to display **/
  readonly output: IRefCheckOutput

  /** Whether call for actions logs is pending */
  readonly loadingLogs: boolean
}

interface ICICheckRunActionLogsState {
  readonly stepOpenState: Map<number, boolean>
}

export class CICheckRunActionLogs extends React.PureComponent<
  ICICheckRunActionLogsProps,
  ICICheckRunActionLogsState
> {
  public constructor(props: ICICheckRunActionLogsProps) {
    super(props)
    this.state = {
      stepOpenState: new Map<number, boolean>(),
    }
  }

  public toggleOpenState = (index: number) => {
    return () => {
      const { stepOpenState } = this.state
      stepOpenState.set(index, !(stepOpenState.get(index) === true))
      this.setState({ stepOpenState: new Map(stepOpenState) })
    }
  }

  public render() {
    const { output, loadingLogs } = this.props

    if (loadingLogs) {
      return <>Loading...</>
    }

    if (output.type !== RefCheckOutputType.Actions) {
      // This shouldn't happen, should only be provided actions type
      return <>Unable to load logs.</>
    }

    return output.steps.map((step, i) => {
      const showLogs = this.state.stepOpenState.get(i) === true

      const header = (
        <div className="ci-check-run-log-step-header-container">
          <Octicon
            className="log-step-toggled-indicator"
            symbol={
              showLogs ? OcticonSymbol.chevronDown : OcticonSymbol.chevronRight
            }
            title={step.name}
          />

          <Octicon
            className={classNames(
              'log-step-status',
              `ci-status-${getClassNameForLogStep(step)}`
            )}
            symbol={getSymbolForLogStep(step)}
            title={step.name}
          />
          <div className="ci-check-run-log-step-name">{step.name}</div>
          <div>{getFormattedCheckRunDuration(step)}</div>
        </div>
      )

      const headerClassNames = classNames('ci-check-run-log-step-header', {
        open: showLogs,
      })
      return (
        <div
          className="ci-check-run-log-step"
          key={i}
          onClick={this.toggleOpenState(i)}
        >
          <div className={headerClassNames}>{header}</div>
          {showLogs ? (
            <div className="ci-check-run-step-log-display">{step.log}</div>
          ) : null}
        </div>
      )
    })
  }
}
