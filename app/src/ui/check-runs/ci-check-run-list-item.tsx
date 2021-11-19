import * as React from 'react'
import {
  getCheckRunDisplayName,
  IRefCheck,
} from '../../lib/ci-checks/ci-checks'
import { Octicon } from '../octicons'
import { getClassNameForCheck, getSymbolForCheck } from '../branches/ci-status'
import classNames from 'classnames'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { TooltippedContent } from '../lib/tooltipped-content'
import { CICheckRunActionsJobStepList } from './ci-check-run-actions-job-step-list'
import { IAPIWorkflowJobStep } from '../../lib/api'
import { TooltipDirection } from '../lib/tooltip'

interface ICICheckRunListItemProps {
  /** The check run to display **/
  readonly checkRun: IRefCheck

  /** Whether call for actions logs is pending */
  readonly loadingActionLogs: boolean

  /** Whether tcall for actions workflows is pending */
  readonly loadingActionWorkflows: boolean

  /** Whether to show the logs for this check run */
  readonly isCheckRunExpanded: boolean

  /** Whether or not to show the action workflow event in the title */
  readonly showEventInTitle: boolean

  /** Whether the list item can be selected */
  readonly selectable: boolean

  /** Whether the list item is selected */
  readonly selected: boolean

  /** Callback for when a check run is clicked */
  readonly onCheckRunExpansionToggleClick: (checkRun: IRefCheck) => void

  /** Callback to opens check runs target url (maybe GitHub, maybe third party) */
  readonly onViewCheckExternally: (checkRun: IRefCheck) => void

  /** Callback to open a job steps link on dotcom*/
  readonly onViewJobStep?: (
    checkRun: IRefCheck,
    step: IAPIWorkflowJobStep
  ) => void
}

/** The CI check list item. */
export class CICheckRunListItem extends React.PureComponent<
  ICICheckRunListItemProps
> {
  private toggleCheckRunExpansion = () => {
    this.props.onCheckRunExpansionToggleClick(this.props.checkRun)
  }

  private onViewCheckExternally = () => {
    this.props.onViewCheckExternally(this.props.checkRun)
  }

  private onViewJobStep = (step: IAPIWorkflowJobStep) => {
    this.props.onViewJobStep?.(this.props.checkRun, step)
  }

  private renderCheckStatusSymbol = (): JSX.Element => {
    const { checkRun } = this.props

    return (
      <div className="ci-check-status-symbol">
        <Octicon
          className={classNames(
            'ci-status',
            `ci-status-${getClassNameForCheck(checkRun)}`
          )}
          symbol={getSymbolForCheck(checkRun)}
        />
      </div>
    )
  }

  private renderCheckJobStepToggle = (): JSX.Element | null => {
    const { checkRun, isCheckRunExpanded, selectable } = this.props

    if (checkRun.actionJobSteps === undefined || selectable) {
      return null
    }

    return (
      <div className="job-step-toggled-indicator">
        <Octicon
          symbol={
            isCheckRunExpanded
              ? OcticonSymbol.chevronDown
              : OcticonSymbol.chevronUp
          }
        />
      </div>
    )
  }

  private renderCheckRunName = (): JSX.Element => {
    const { checkRun } = this.props
    const name = getCheckRunDisplayName(checkRun, this.props.showEventInTitle)
    return (
      <div className="ci-check-list-item-detail">
        <TooltippedContent
          className="ci-check-name"
          tooltip={name}
          onlyWhenOverflowed={true}
          tagName="div"
          direction={TooltipDirection.NORTH}
        >
          <span onClick={this.onViewCheckExternally}>{name}</span>
        </TooltippedContent>

        <div className="ci-check-description">{checkRun.description}</div>
      </div>
    )
  }

  public render() {
    const { checkRun, isCheckRunExpanded } = this.props

    return (
      <>
        <div
          className={classNames('ci-check-list-item list-item', {
            selected: this.props.selected,
          })}
          tabIndex={0}
          onClick={this.toggleCheckRunExpansion}
        >
          {this.renderCheckStatusSymbol()}
          {this.renderCheckRunName()}
          {this.renderCheckJobStepToggle()}
        </div>
        {isCheckRunExpanded && checkRun.actionJobSteps !== undefined ? (
          <CICheckRunActionsJobStepList
            steps={checkRun.actionJobSteps}
            onViewJobStep={this.onViewJobStep}
          />
        ) : null}
      </>
    )
  }
}
