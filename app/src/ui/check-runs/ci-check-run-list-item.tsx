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
  readonly hasFocus: boolean
}

/** The CI check list item. */
export class CICheckRunListItem extends React.PureComponent<
  ICICheckRunListItemProps,
  ICICheckRunListItemState
> {
  public constructor(props: ICICheckRunListItemProps) {
    super(props)
    this.state = { hasFocus: false }
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

  private onFocus = () => {
    if (!this.state.hasFocus) {
      this.setState({ hasFocus: true })
    }
  }

  private onLooseFocus = () => {
    this.setState({ hasFocus: false })
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
      return <div className="job-step-toggled-indicator-placeholder"></div>
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
    const { checkRun, isCondensedView } = this.props
    const { name, description } = checkRun
    return (
      <div className="ci-check-list-item-detail">
        <TooltippedContent
          className="ci-check-name"
          tooltip={name}
          onlyWhenOverflowed={true}
          tagName="h3"
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
    const { checkRun, isCheckRunExpanded, onRerunJob } = this.props
    const { hasFocus } = this.state

    if (onRerunJob === undefined) {
      return null
    }

    const viewOcticon = hasFocus || isCheckRunExpanded

    const classes = classNames('job-rerun', {
      'not-action-job': checkRun.actionJobSteps === undefined,
    })

    const tooltip =
      checkRun.actionJobSteps !== undefined
        ? 'Re-run this check'
        : 'This check cannot be re-run individually.'

    return (
      <Button
        className={classes}
        tooltip={tooltip}
        onClick={this.rerunJob}
        ariaLabel={tooltip}
      >
        {viewOcticon && <Octicon symbol={octicons.sync} />}
      </Button>
    )
  }

  private renderLinkExternal = (): JSX.Element | null => {
    const { onViewCheckExternally, isCheckRunExpanded } = this.props
    const { hasFocus } = this.state

    if (onViewCheckExternally === undefined) {
      return null
    }

    const viewOcticon = hasFocus || isCheckRunExpanded

    return (
      <Button
        role="link"
        className="view-check-externally"
        onClick={this.onViewCheckExternally}
        tooltip="View on GitHub"
        ariaLabel="View on GitHub"
      >
        {viewOcticon && <Octicon symbol={octicons.linkExternal} />}
      </Button>
    )
  }

  private renderCheckRunButton = (): JSX.Element | null => {
    const { checkRun, selectable, notExpandable } = this.props
    const disabled =
      checkRun.actionJobSteps === undefined ||
      selectable ||
      notExpandable === true

    return (
      <Button
        className="ci-check-status-button"
        onClick={this.toggleCheckRunExpansion}
        ariaExpanded={
          notExpandable === true ? undefined : this.props.isCheckRunExpanded
        }
        disabled={disabled}
      >
        {this.renderCheckStatusSymbol()}
        {this.renderCheckRunName()}
        {this.renderCheckJobStepToggle()}
      </Button>
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
        onMouseEnter={this.onFocus}
        onMouseLeave={this.onLooseFocus}
        onFocus={this.onFocus}
        onBlur={this.onLooseFocus}
      >
        <div className={classes}>
          {this.renderCheckRunButton()}

          <span className="check-run-header-buttons">
            {this.renderJobRerun()}
            {this.renderLinkExternal()}
          </span>
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
