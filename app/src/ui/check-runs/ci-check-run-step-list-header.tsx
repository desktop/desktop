import * as React from 'react'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { Button } from '../lib/button'
import { getCombinedStatusSummary } from './ci-check-run-popover'
import { IRefCheck } from '../../lib/ci-checks/ci-checks'

interface ICICheckRunStepListHeaderProps {
  /** The check run to display **/
  readonly checkRun: IRefCheck

  /** Callback to opens check runs target url (maybe GitHub, maybe third party) */
  readonly onViewCheckExternally: () => void

  /** Callback to rerun a job*/
  readonly onRerunJob?: (check: IRefCheck) => void
}

/** The CI check no step view. */
export class CICheckRunStepListHeader extends React.PureComponent<ICICheckRunStepListHeaderProps> {
  private onRerunJob = () => {
    const { onRerunJob, checkRun } = this.props
    onRerunJob?.(checkRun)
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
        onClick={this.onRerunJob}
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
        onClick={this.props.onViewCheckExternally}
        tooltip={label}
        ariaLabel={label}
      >
        <Octicon symbol={octicons.linkExternal} />
      </Button>
    )
  }

  public render() {
    const { actionJobSteps } = this.props.checkRun

    if (actionJobSteps === undefined) {
      return null
    }

    return (
      <div className="ci-check-run-steps-header">
        <h4>{getCombinedStatusSummary(actionJobSteps, 'step')}</h4>
        {this.renderJobRerun()}
        {this.renderLinkExternal()}
      </div>
    )
  }
}
