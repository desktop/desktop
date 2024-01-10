import * as React from 'react'
import { IAPIWorkflowJobStep } from '../../lib/api'
import { isFailure } from '../../lib/ci-checks/ci-checks'
import { CICheckRunActionsJobStepListItem } from './ci-check-run-actions-job-step-item'

interface ICICheckRunActionsJobStepListsProps {
  /** The action jobs steps of a check run **/
  readonly steps: ReadonlyArray<IAPIWorkflowJobStep>

  /** Callback to open a job steps link on dotcom*/
  readonly onViewJobStep: (step: IAPIWorkflowJobStep) => void
}

interface ICICheckRunActionsJobStepListsState {
  readonly firstFailedStep: IAPIWorkflowJobStep | undefined
}

/** The CI check list item. */
export class CICheckRunActionsJobStepList extends React.PureComponent<
  ICICheckRunActionsJobStepListsProps,
  ICICheckRunActionsJobStepListsState
> {
  public constructor(props: ICICheckRunActionsJobStepListsProps) {
    super(props)

    this.state = {
      firstFailedStep: this.props.steps.find(isFailure),
    }
  }

  public componentDidUpdate() {
    this.setState({
      firstFailedStep: this.props.steps.find(isFailure),
    })
  }

  public render() {
    const { steps } = this.props

    const jobSteps = steps.map((step, i) => {
      return (
        <CICheckRunActionsJobStepListItem
          key={i}
          step={step}
          firstFailedStep={this.state.firstFailedStep}
          onViewJobStepExternally={this.props.onViewJobStep}
        />
      )
    })

    return <ul className="ci-check-run-job-steps-list">{jobSteps}</ul>
  }
}
