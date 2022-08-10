import * as React from 'react'
import { IRefCheck } from '../../lib/ci-checks/ci-checks'
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

  /** Whether the list item can be selected */
  readonly selectable: boolean

  /** Whether the list item is selected */
  readonly selected: boolean

  /** Whether check runs can be expanded. Default: false */
  readonly notExpandable?: boolean

  /** Showing a condensed view */
  readonly isCondensedView?: boolean

  /** Callback for when a check run is clicked */
  readonly onCheckRunExpansionToggleClick: (checkRun: IRefCheck) => void

  /** Callback to opens check runs target url (maybe GitHub, maybe third party) */
  readonly onViewCheckExternally?: (checkRun: IRefCheck) => void

  /** Callback to open a job steps link on dotcom*/
  readonly onViewJobStep?: (
    checkRun: IRefCheck,
    step: IAPIWorkflowJobStep
  ) => void

  /** Callback to rerun a job*/
  readonly onRerunJob?: (checkRun: IRefCheck) => void
}

interface ICICheckRunListItemState {
  readonly isMouseOver: boolean
}

/** The CI check list item. */
export class CICheckRunListItem extends React.PureComponent<
  ICICheckRunListItemProps,
  ICICheckRunListItemState
> {
  public constructor(props: ICICheckRunListItemProps) {
    super(props)
    this.state = { isMouseOver: false }
  }

  private toggleCheckRunExpansion = () => {
    this.props.onCheckRunExpansionToggleClick(this.props.checkRun)
  }

  private onViewCheckExternally = () => {
    this.props.onViewCheckExternally?.(this.props.checkRun)
  }

  private onViewJobStep = (step: IAPIWorkflowJobStep) => {
    this.props.onViewJobStep?.(this.props.checkRun, step)
  }

  private rerunJob = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (this.props.checkRun.actionJobSteps === undefined) {
      return
    }

    this.props.onRerunJob?.(this.props.checkRun)
  }

  private onMouseEnter = () => {
    if (!this.state.isMouseOver) {
      this.setState({ isMouseOver: true })
    }
  }

  private onMouseLeave = (e: React.MouseEvent) => {
    this.setState({ isMouseOver: false })
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
    const { checkRun, isCheckRunExpanded, selectable, notExpandable } =
      this.props

    if (
      checkRun.actionJobSteps === undefined ||
      selectable ||
      notExpandable === true
    ) {
      return null
    }

    return (
      <div className="job-step-toggled-indicator">
        <Octicon
          symbol={
            isCheckRunExpanded
              ? OcticonSymbol.chevronUp
              : OcticonSymbol.chevronDown
          }
        />
      </div>
    )
  }

  private renderCheckRunName = (): JSX.Element => {
    const { checkRun, isCondensedView, onViewCheckExternally } = this.props
    const { name, description } = checkRun
    return (
      <div className="ci-check-list-item-detail">
        <TooltippedContent
          className="ci-check-name"
          tooltip={name}
          onlyWhenOverflowed={true}
          tagName="div"
          direction={TooltipDirection.NORTH}
        >
          <span
            className={classNames({
              isLink: onViewCheckExternally !== undefined,
            })}
            onClick={this.onViewCheckExternally}
          >
            {name}
          </span>
        </TooltippedContent>

        {isCondensedView ? null : (
          <div className="ci-check-description">{description}</div>
        )}
      </div>
    )
  }

  private renderJobRerun = (): JSX.Element | null => {
    const { checkRun, onRerunJob } = this.props
    const { isMouseOver } = this.state

    if (!isMouseOver || onRerunJob === undefined) {
      return null
    }

    const classes = classNames('job-rerun', {
      'not-action-job': checkRun.actionJobSteps === undefined,
    })

    const tooltip =
      checkRun.actionJobSteps !== undefined
        ? 'Re-run this check'
        : 'This check cannot be re-run individually.'

    return (
      <div className={classes} onClick={this.rerunJob}>
        <TooltippedContent tooltip={tooltip}>
          <Octicon symbol={OcticonSymbol.sync} />
        </TooltippedContent>
      </div>
    )
  }

  public render() {
    const { checkRun, isCheckRunExpanded, selected, isCondensedView } =
      this.props

    const classes = classNames('ci-check-list-item', 'list-item', {
      sticky: isCheckRunExpanded,
      selected,
      condensed: isCondensedView,
    })
    return (
      <div
        className="ci-check-list-item-group"
        onMouseEnter={this.onMouseEnter}
        onMouseLeave={this.onMouseLeave}
      >
        <div
          className={classes}
          onClick={this.toggleCheckRunExpansion}
          tabIndex={0}
        >
          {this.renderCheckStatusSymbol()}
          {this.renderCheckRunName()}
          {this.renderJobRerun()}
          {this.renderCheckJobStepToggle()}
        </div>
        {isCheckRunExpanded && checkRun.actionJobSteps !== undefined ? (
          <CICheckRunActionsJobStepList
            steps={checkRun.actionJobSteps}
            onViewJobStep={this.onViewJobStep}
          />
        ) : null}
      </div>
    )
  }
}
