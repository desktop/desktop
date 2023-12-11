/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import * as React from 'react'
import { Octicon } from '../octicons'
import classNames from 'classnames'
import {
  getClassNameForCheck,
  getSymbolForLogStep,
} from '../branches/ci-status'
import { IAPIWorkflowJobStep } from '../../lib/api'
import {
  getFormattedCheckRunDuration,
  getFormattedCheckRunLongDuration,
} from '../../lib/ci-checks/ci-checks'
import { TooltippedContent } from '../lib/tooltipped-content'
import { TooltipDirection } from '../lib/tooltip'

interface ICICheckRunActionsJobStepListItemProps {
  readonly step: IAPIWorkflowJobStep
  readonly firstFailedStep: IAPIWorkflowJobStep | undefined

  /** Callback to open a job steps link on dotcom*/
  readonly onViewJobStepExternally: (step: IAPIWorkflowJobStep) => void
}

export class CICheckRunActionsJobStepListItem extends React.PureComponent<ICICheckRunActionsJobStepListItemProps> {
  private onViewJobStepExternally = () => {
    this.props.onViewJobStepExternally(this.props.step)
  }

  private onStepHeaderRef = (step: IAPIWorkflowJobStep) => {
    return (stepHeaderRef: HTMLLIElement | null) => {
      if (
        this.props.firstFailedStep !== undefined &&
        step.number === this.props.firstFailedStep.number &&
        stepHeaderRef !== null
      ) {
        stepHeaderRef.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  }

  public render() {
    const { step } = this.props
    return (
      <li
        className="ci-check-run-job-step list-item"
        ref={this.onStepHeaderRef(step)}
        aria-label={`${step.name}, ${getFormattedCheckRunLongDuration(
          step
        )}, ${getClassNameForCheck(step)}`}
      >
        <div className="job-step-status-symbol">
          <Octicon
            className={classNames(
              'ci-status',
              `ci-status-${getClassNameForCheck(step)}`
            )}
            symbol={getSymbolForLogStep(step)}
          />
        </div>

        <TooltippedContent
          className="job-step-name"
          tooltip={step.name}
          onlyWhenOverflowed={true}
          tagName="div"
          direction={TooltipDirection.NORTH}
        >
          <span onClick={this.onViewJobStepExternally}>{step.name}</span>
        </TooltippedContent>

        <div className="job-step-duration">
          {getFormattedCheckRunDuration(step)}
        </div>
      </li>
    )
  }
}
