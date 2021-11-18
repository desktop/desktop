import * as React from 'react'
import { IAPIWorkflowJobStep } from '../../lib/api'
import {
  getCheckRunDisplayName,
  IRefCheck,
  isFailure,
} from '../../lib/ci-checks/ci-checks'
import { CICheckRunListItem } from './ci-check-run-list-item'

interface ICICheckRunListProps {
  /** List of check runs to display */
  readonly checkRuns: ReadonlyArray<IRefCheck>

  /** Whether loading action logs */
  readonly loadingActionLogs: boolean

  /** Whether loading workflow  */
  readonly loadingActionWorkflows: boolean

  /** Callback to opens check runs target url (maybe GitHub, maybe third party) */
  readonly onViewCheckDetails: (checkRun: IRefCheck) => void

  /** Callback to open a job steps link on dotcom*/
  readonly onViewJobStep: (
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
    let checkRunExpanded =
      currentState !== null ? currentState.checkRunExpanded : null

    if (currentState === null || !currentState.hasUserToggledCheckRun) {
      // If there is a failure, we want the first check run with a failure, to
      // be opened so the user doesn't have to click through to find it.
      // Otherwise, just open the first one. (Only actions type can be expanded.)
      const firstFailure = props.checkRuns.find(
        cr => isFailure(cr) && cr.actionJobSteps !== undefined
      )
      checkRunExpanded =
        firstFailure !== undefined
          ? firstFailure.id.toString()
          : props.checkRuns[0].id.toString()
    }

    const checkRunEvents = new Set(
      props.checkRuns
        .map(c => c.actionsWorkflow?.event)
        .filter(c => c !== undefined && c.trim() !== '')
    )
    return {
      checkRunExpanded,
      hasUserToggledCheckRun:
        currentState !== null ? currentState.hasUserToggledCheckRun : false,
      checkRunsHaveMultipleEventTypes: checkRunEvents.size > 1,
    }
  }

  private onCheckRunClick = (checkRun: IRefCheck): void => {
    this.setState({
      checkRunExpanded:
        this.state.checkRunExpanded === checkRun.id.toString()
          ? null
          : checkRun.id.toString(),
      hasUserToggledCheckRun: true,
    })
  }

  private renderList = (): JSX.Element | null => {
    const list = [...this.props.checkRuns]
      .sort((a, b) =>
        getCheckRunDisplayName(
          a,
          this.state.checkRunsHaveMultipleEventTypes
        ).localeCompare(
          getCheckRunDisplayName(b, this.state.checkRunsHaveMultipleEventTypes)
        )
      )
      .map((c, i) => {
        return (
          <CICheckRunListItem
            key={i}
            checkRun={c}
            loadingActionLogs={this.props.loadingActionLogs}
            loadingActionWorkflows={this.props.loadingActionWorkflows}
            isCheckRunExpanded={this.state.checkRunExpanded === c.id.toString()}
            onCheckRunExpansionToggleClick={this.onCheckRunClick}
            onViewCheckExternally={this.props.onViewCheckDetails}
            onViewJobStep={this.props.onViewJobStep}
            showEventInTitle={this.state.checkRunsHaveMultipleEventTypes}
          />
        )
      })

    return <>{list}</>
  }

  public render() {
    return <div className="ci-check-run-list">{this.renderList()}</div>
  }
}
