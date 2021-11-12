import * as React from 'react'
import { Octicon } from '../octicons'
import classNames from 'classnames'
import {
  getClassNameForCheck,
  getSymbolForLogStep,
} from '../branches/ci-status'
import { IAPIWorkflowJobStep } from '../../lib/api'
import { getFormattedCheckRunDuration } from '../../lib/ci-checks/ci-checks'
import { TooltippedContent } from '../lib/tooltipped-content'

interface ICICheckRunActionsJobStepListItemProps {
  readonly step: IAPIWorkflowJobStep
  readonly firstFailedStep: IAPIWorkflowJobStep | undefined

  /** Callback to open a job steps link on dotcom*/
  readonly onViewJobStep: (step: IAPIWorkflowJobStep) => void
}

export class CICheckRunActionsJobStepListItem extends React.PureComponent<
  ICICheckRunActionsJobStepListItemProps
> {
  private onViewJobStep = () => {
    this.props.onViewJobStep(this.props.step)
  }

  private onStepHeaderRef = (step: IAPIWorkflowJobStep) => {
    return (stepHeaderRef: HTMLDivElement | null) => {
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
      <TooltippedContent
        className="ci-check-run-job-step"
        tooltip="View online"
        tagName="div"
      >
        <div
          className="list-item"
          onClick={this.onViewJobStep}
          ref={this.onStepHeaderRef(step)}
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

          <div className="job-step-name">{step.name}</div>
          <div className="job-step-duration">
            {getFormattedCheckRunDuration(step)}
          </div>
        </div>
      </TooltippedContent>
    )
  }
}
