import _ from 'lodash'
import * as React from 'react'
import { IAPIWorkflowJobStep } from '../../lib/api'
import { IRefCheck, isFailure } from '../../lib/ci-checks/ci-checks'
import { CICheckRunListItem } from './ci-check-run-list-item'
import { FocusContainer } from '../lib/focus-container'

interface ICICheckRunListProps {
  /** List of check runs to display */
  readonly checkRuns: ReadonlyArray<IRefCheck>

  /** Whether loading action logs */
  readonly loadingActionLogs: boolean

  /** Whether loading workflow  */
  readonly loadingActionWorkflows: boolean

  /** Whether check runs can be selected. Default: false */
  readonly selectable?: boolean

  /** Callback to opens check runs target url (maybe GitHub, maybe third party) */
  readonly onViewCheckDetails: (checkRun: IRefCheck) => void

  /** Callback when a check run is clicked */
  readonly onCheckRunClick?: (checkRun: IRefCheck) => void

  /** Callback to open a job steps link on dotcom*/
  readonly onViewJobStep?: (
    checkRun: IRefCheck,
    step: IAPIWorkflowJobStep
  ) => void
}

interface ICICheckRunListState {
  readonly checkRunExpanded: string | null
  readonly hasUserToggledCheckRun: boolean
  readonly checkRunsHaveMultipleEventTypes: boolean
}

/** The CI Check list. */
export class CICheckRunList extends React.PureComponent<
  ICICheckRunListProps,
  ICICheckRunListState
> {
  public constructor(props: ICICheckRunListProps) {
    super(props)

    this.state = this.setupStateAfterCheckRunPropChange(this.props, null)
  }

  public componentDidUpdate(prevProps: ICICheckRunListProps) {
    this.setState(
      this.setupStateAfterCheckRunPropChange(this.props, this.state)
    )
  }

  private setupStateAfterCheckRunPropChange(
    props: ICICheckRunListProps,
    currentState: ICICheckRunListState | null
  ): ICICheckRunListState {
    let checkRunExpanded = currentState?.checkRunExpanded ?? null

    if (currentState === null || !currentState.hasUserToggledCheckRun) {
      // If there is a failure, we want the first check run with a failure, to
      // be opened so the user doesn't have to click through to find it.
      // Otherwise, just open the first one. (Only actions type can be expanded.)
      const firstFailure = props.checkRuns.find(
        cr => isFailure(cr) && cr.actionJobSteps !== undefined
      )

      const checkRun = firstFailure ?? props.checkRuns[0]
      checkRunExpanded = checkRun.id.toString()
    }

    const checkRunEvents = new Set(
      props.checkRuns
        .map(c => c.actionsWorkflow?.event)
        .filter(c => c !== undefined && c.trim() !== '')
    )
    return {
      checkRunExpanded,
      hasUserToggledCheckRun: currentState?.hasUserToggledCheckRun || false,
      checkRunsHaveMultipleEventTypes: checkRunEvents.size > 1,
    }
  }

  private onCheckRunClick = (checkRun: IRefCheck): void => {
    // If the list is selectable, we don't want to toggle when the selected
    // item is clicked again.
    const checkRunExpanded =
      this.state.checkRunExpanded === checkRun.id.toString() &&
      !this.props.selectable
        ? null
        : checkRun.id.toString()

    this.setState({
      checkRunExpanded,
      hasUserToggledCheckRun: true,
    })

    this.props.onCheckRunClick?.(checkRun)
  }

  private getCheckRunsGroupedByWorkflowAction = (): _.Dictionary<
    IRefCheck[]
  > => {
    const groups = _.groupBy(this.props.checkRuns, item =>
      _.get(item, 'actionsWorkflow.name', 'Other')
    )

    if (groups.Other === undefined) {
      return groups
    }

    const codeScanResults = groups.Other.filter(
      check => check.appName === 'GitHub Code Scanning'
    )

    if (codeScanResults.length === 0) {
      return groups
    }

    groups['Code scanning results'] = codeScanResults

    const other = groups.Other.filter(
      check => check.appName !== 'GitHub Code Scanning'
    )

    if (other.length > 0) {
      groups['Other'] = other
    } else {
      delete groups.Other
    }

    return groups
  }

  private getCheckRunGroupNames = (): ReadonlyArray<string> => {
    const groupNameSet = new Set<string>()

    for (const checkRun of this.props.checkRuns) {
      let name = checkRun.actionsWorkflow?.name || 'Other'
      if (name === 'Other' && checkRun.appName === 'GitHub Code Scanning') {
        name = 'Code scanning results'
      }
      if (groupNameSet.has(name)) {
        continue
      }

      groupNameSet.add(name)
    }

    const groupNames = [...groupNameSet.values()]

    // Sort names with 'Other' always last.
    groupNames.sort((a, b) => {
      if (a === 'Other' && b !== 'Other') {
        return 1
      }

      if (a !== 'Other' && b === 'Other') {
        return -1
      }

      if (a === 'Other' && b === 'Other') {
        return 0
      }

      return a.localeCompare(b)
    })

    return groupNames
  }

  private renderListItems = (checkRuns: ReadonlyArray<IRefCheck>) => {
    const list = [...checkRuns]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c, i) => {
        const checkRunExpanded = this.state.checkRunExpanded === c.id.toString()
        const selectable = this.props.selectable === true

        return (
          <CICheckRunListItem
            checkRun={c}
            key={i}
            loadingActionLogs={this.props.loadingActionLogs}
            loadingActionWorkflows={this.props.loadingActionWorkflows}
            selectable={selectable}
            selected={selectable && checkRunExpanded}
            // Only expand check runs if the list is not selectable
            isCheckRunExpanded={!selectable && checkRunExpanded}
            onCheckRunExpansionToggleClick={this.onCheckRunClick}
            onViewCheckExternally={this.props.onViewCheckDetails}
            onViewJobStep={this.props.onViewJobStep}
            showEventInTitle={this.state.checkRunsHaveMultipleEventTypes}
          />
        )
      })

    return (
      <FocusContainer className="list-focus-container">{list}</FocusContainer>
    )
  }

  private renderList = (): JSX.Element | null => {
    const checkRunGroupNames = this.getCheckRunGroupNames()
    if (checkRunGroupNames.length === 1 && checkRunGroupNames[0] === 'Other') {
      return this.renderListItems(this.props.checkRuns)
    }

    const checkRunGroups = this.getCheckRunsGroupedByWorkflowAction()
    const groups = checkRunGroupNames.map((groupName, i) => {
      return (
        <div className="ci-check-run-list-group" key={i}>
          <div className="ci-check-run-list-group-header">{groupName}</div>
          {this.renderListItems(checkRunGroups[groupName])}
        </div>
      )
    })

    return <>{groups}</>
  }

  public render() {
    return (
      <div className="ci-check-run-list-container">{this.renderList()}</div>
    )
  }
}
