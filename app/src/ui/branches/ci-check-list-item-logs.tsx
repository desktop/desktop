import classNames from 'classnames'
import * as React from 'react'
import {
  IRefCheck,
  IRefCheckOutput,
  RefCheckOutputType,
} from '../../lib/stores/commit-status-store'
import { Button } from '../lib/button'
import { CICheckRunActionLogs } from './ci-check-run-action-logs'

interface ICICheckRunListItemLogsProps {
  /** The check run to display **/
  readonly checkRun: IRefCheck

  /** Whether call for actions logs is pending */
  readonly loadingLogs: boolean

  /** Callback to opens check runs on GitHub */
  readonly onViewOnGitHub: (checkRun: IRefCheck) => void
}

/** The CI check list item. */
export class CICheckRunListItemLogs extends React.PureComponent<
  ICICheckRunListItemLogsProps
> {
  private onViewOnGitHub = () => {
    this.props.onViewOnGitHub(this.props.checkRun)
  }

  private isNoAdditionalInfoToDisplay(output: IRefCheckOutput): boolean {
    return (
      this.isNoOutputText(output) &&
      (output.summary === undefined ||
        output.summary === null ||
        output.summary.trim() === '')
    )
  }

  private isNoOutputText = (output: IRefCheckOutput): boolean => {
    return (
      !this.hasActionsWorkflowLogs() &&
      output.type === RefCheckOutputType.Default &&
      (output.text === null || output.text.trim() === '')
    )
  }

  private renderNonActionsLogOutput = (output: IRefCheckOutput) => {
    if (output.type === RefCheckOutputType.Actions || output.text === null) {
      return null
    }

    // TODO: Markdown needs to be parsed/santized. Later PR
    return <div dangerouslySetInnerHTML={{ __html: output.text }}></div>
  }

  private renderMetaOutput = (
    output: IRefCheckOutput,
    checkRunName: string
  ) => {
    if (this.hasActionsWorkflowLogs()) {
      return null
    }

    const { title, summary } = output

    // Don't display something empty or redundant
    const displayTitle =
      title !== null &&
      title.trim() !== '' &&
      title.trim().toLocaleLowerCase() !==
        checkRunName.trim().toLocaleLowerCase()

    // TODO: Markdown needs to be parsed/santized. Later PR
    const displaySummary =
      summary !== null && summary !== undefined && summary.trim() !== ''

    return (
      <div>
        {displayTitle ? <div>{title}</div> : null}
        {displaySummary ? <pre>{summary}</pre> : null}
      </div>
    )
  }

  private renderEmptyLogOutput = () => {
    return (
      <div className="no-logs-to-display">
        No additional information to display.
      </div>
    )
  }

  private renderViewOnGitHub = () => {
    return (
      <div className="view-on-github">
        <Button onClick={this.onViewOnGitHub}>View on GitHub</Button>
      </div>
    )
  }

  private hasActionsWorkflowLogs = (): boolean => {
    return this.props.checkRun.jobs_url !== undefined
  }

  public render() {
    const {
      loadingLogs,
      checkRun: { output, name },
    } = this.props

    const logsOutput = this.hasActionsWorkflowLogs() ? (
      <CICheckRunActionLogs output={output} loadingLogs={loadingLogs} />
    ) : (
      this.renderNonActionsLogOutput(output)
    )

    const className = classNames('ci-check-list-item-logs', {
      actions: this.hasActionsWorkflowLogs(),
    })

    return (
      <div className={className}>
        <div className="ci-check-list-item-logs-output">
          {this.isNoAdditionalInfoToDisplay(output)
            ? this.renderEmptyLogOutput()
            : this.renderMetaOutput(output, name)}
          {logsOutput}
        </div>
        {this.renderViewOnGitHub()}
      </div>
    )
  }
}
