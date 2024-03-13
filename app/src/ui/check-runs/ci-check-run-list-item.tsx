import * as React from 'react'
import { IRefCheck } from '../../lib/ci-checks/ci-checks'
import { Octicon } from '../octicons'
import { getClassNameForCheck, getSymbolForCheck } from '../branches/ci-status'
import classNames from 'classnames'
import * as octicons from '../octicons/octicons.generated'
import { TooltippedContent } from '../lib/tooltipped-content'
import { CICheckRunActionsJobStepList } from './ci-check-run-actions-job-step-list'
import { IAPIWorkflowJobStep } from '../../lib/api'
import { TooltipDirection } from '../lib/tooltip'
import { Button } from '../lib/button'
import { LinkButton } from '../lib/link-button'
import { getCombinedStatusSummary } from './ci-check-run-popover'

interface ICICheckRunListItemProps {
  /** The check run to display **/
  readonly checkRun: IRefCheck

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

  /**
   * When the list item is displayed in the rerun dialog, there are no sub
   * elements or view so they are not headers.
   *
   * Default: true
   **/
  readonly isHeader?: false

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

/** The CI check list item. */
export class CICheckRunListItem extends React.PureComponent<ICICheckRunListItemProps> {
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
    const { isCheckRunExpanded, selectable, notExpandable } = this.props

    if (selectable || notExpandable) {
      return null
    }

    return (
      <div className="job-step-toggled-indicator">
        <Octicon
          symbol={
            isCheckRunExpanded ? octicons.chevronUp : octicons.chevronDown
          }
        />
      </div>
    )
  }

  private renderCheckRunName = (): JSX.Element => {
    const { checkRun, isCondensedView, isHeader } = this.props
    const { name, description } = checkRun
    return (
      <div className="ci-check-list-item-detail">
        <TooltippedContent
          id={`check-run-header-${checkRun.id}`}
          className="ci-check-name"
          tooltip={name}
          onlyWhenOverflowed={true}
          tagName={isHeader === false ? 'span' : 'h3'}
          direction={TooltipDirection.NORTH}
        >
          {name}
        </TooltippedContent>

        {isCondensedView ? null : (
          <div className="ci-check-description">{description}</div>
        )}
      </div>
    )
  }

  private renderJobRerun = (): JSX.Element | null => {
    const { checkRun, onRerunJob } = this.props

    if (onRerunJob === undefined) {
      return null
    }

    const tooltip = `Re-run ${checkRun.name}`
    return (
      <Button
        className="job-rerun"
        tooltip={tooltip}
        onClick={this.rerunJob}
        ariaLabel={tooltip}
      >
        <Octicon symbol={octicons.sync} />
      </Button>
    )
  }

  private renderLinkExternal = (): JSX.Element | null => {
    const { onViewCheckExternally, checkRun } = this.props

    if (onViewCheckExternally === undefined) {
      return null
    }

    const label = `View ${checkRun.name} on GitHub`
    return (
      <Button
        role="link"
        className="view-check-externally"
        onClick={this.onViewCheckExternally}
        tooltip={label}
        ariaLabel={label}
      >
        <Octicon symbol={octicons.linkExternal} />
      </Button>
    )
  }

  private renderCheckRunButton = (): JSX.Element | null => {
    const { checkRun, selectable } = this.props

    return (
      <Button
        className="ci-check-status-button"
        onClick={this.toggleCheckRunExpansion}
        ariaExpanded={!selectable ? this.props.isCheckRunExpanded : undefined}
        ariaControls={`checkRun-${checkRun.id}`}
      >
        {this.renderCheckStatusSymbol()}
        {this.renderCheckRunName()}
        {this.renderCheckJobStepToggle()}
      </Button>
    )
  }

  public getStepConclusionText = () => {
    const { actionJobSteps } = this.props.checkRun

    if (actionJobSteps === undefined) {
      return ''
    }

    return getCombinedStatusSummary(actionJobSteps, 'step')
  }

  public renderStepsHeader = (): JSX.Element | null => {
    const { actionJobSteps } = this.props.checkRun

    if (actionJobSteps === undefined) {
      return null
    }

    return (
      <div className="ci-steps-header">
        <h4>{this.getStepConclusionText()}</h4>
        {this.renderJobRerun()}
        {this.renderLinkExternal()}
      </div>
    )
  }

  public renderStepsRegion() {
    const { isCheckRunExpanded, checkRun } = this.props

    if (!isCheckRunExpanded) {
      return null
    }

    return (
      <div
        role="region"
        className="ci-steps-container"
        id={`checkrun-${checkRun.id}`}
        aria-labelledby={`check-run-header-${checkRun.id}`}
      >
        {this.renderStepsHeader()}

        {checkRun.actionJobSteps === undefined ? (
          <div className="no-steps">
            This is not a GitHub Action's check and therefore does not have
            steps. It cannot be rerun in GitHub Desktop,{' '}
            <LinkButton onClick={this.onViewCheckExternally}>
              view the check's details on GitHub.
            </LinkButton>{' '}
          </div>
        ) : (
          <CICheckRunActionsJobStepList
            steps={checkRun.actionJobSteps}
            onViewJobStep={this.onViewJobStep}
          />
        )}
      </div>
    )
  }

  public render() {
    const { isCheckRunExpanded, selected, isCondensedView } = this.props

    const classes = classNames('ci-check-list-item', {
      sticky: isCheckRunExpanded,
      selected,
      condensed: isCondensedView,
    })
    return (
      <div className="ci-check-list-item-group">
        <div className={classes}>{this.renderCheckRunButton()}</div>
        {this.renderStepsRegion()}
      </div>
    )
  }
}
