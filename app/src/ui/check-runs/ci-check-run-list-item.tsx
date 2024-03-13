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
import { CICheckRunNoStepItem } from './ci-check-run-no-steps'
import { CICheckRunStepListHeader } from './ci-check-run-step-list-header'

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

  private rerunJob = () => {
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

  private renderCheckRunListItem = (): JSX.Element | null => {
    const {
      checkRun,
      selectable,
      notExpandable,
      isCheckRunExpanded,
      selected,
      isCondensedView,
    } = this.props

    const classes = classNames('ci-check-list-item', {
      sticky: isCheckRunExpanded,
      selected,
      condensed: isCondensedView,
    })

    const content = (
      <>
        {this.renderCheckStatusSymbol()}
        {this.renderCheckRunName()}
        {this.renderCheckJobStepToggle()}
      </>
    )

    if (!selectable && notExpandable) {
      return <div className={classes}>{content}</div>
    }

    return (
      <Button
        className={classes}
        onClick={this.toggleCheckRunExpansion}
        ariaExpanded={!selectable ? this.props.isCheckRunExpanded : undefined}
        ariaControls={`checkRun-${checkRun.id}`}
      >
        {content}
      </Button>
    )
  }

  public renderStepsRegion() {
    const { isCheckRunExpanded, checkRun } = this.props

    if (!isCheckRunExpanded) {
      return null
    }

    const areNoSteps = checkRun.actionJobSteps === undefined

    const classes = classNames('ci-steps-container', {
      'no-steps': areNoSteps,
    })

    return (
      <div
        role="region"
        className={classes}
        id={`checkrun-${checkRun.id}`}
        aria-labelledby={`check-run-header-${checkRun.id}`}
      >
        <CICheckRunStepListHeader
          checkRun={checkRun}
          onRerunJob={this.rerunJob}
          onViewCheckExternally={this.onViewCheckExternally}
        />

        {areNoSteps ? (
          <CICheckRunNoStepItem
            onViewCheckExternally={this.onViewCheckExternally}
          />
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
    return (
      <>
        {this.renderCheckRunListItem()}
        {this.renderStepsRegion()}
      </>
    )
  }
}
