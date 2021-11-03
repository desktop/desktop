import * as React from 'react'
import {
  IRefCheck,
  IRefCheckOutput,
  RefCheckOutputType,
} from '../../lib/ci-checks/ci-checks'
import classNames from 'classnames'
import { CICheckRunActionLogs } from './ci-check-run-actions-logs'
import { SandboxedMarkdown } from '../lib/sandboxed-markdown'

interface ICICheckRunLogsProps {
  /** The check run to display **/
  readonly checkRun: IRefCheck

  /** Whether call for actions logs is pending */
  readonly loadingActionLogs: boolean

  /** Whether tcall for actions workflows is pending */
  readonly loadingActionWorkflows: boolean

  /** The base href used for relative links provided in check run markdown
   * output */
  readonly baseHref: string | null

  /** Callback to opens check runs on GitHub */
  readonly onMouseOver: (mouseEvent: React.MouseEvent<HTMLDivElement>) => void

  /** Callback to opens check runs on GitHub */
  readonly onMouseLeave: (mouseEvent: React.MouseEvent<HTMLDivElement>) => void

  /** Callback to open URL's originating from markdown */
  readonly onMarkdownLinkClicked: (url: string) => void
}

/** The CI check list item. */
export class CICheckRunLogs extends React.PureComponent<ICICheckRunLogsProps> {
  private isOutputToDisplay(output: IRefCheckOutput): boolean {
    return (
      output.type === RefCheckOutputType.Default &&
      (output.text === null || output.text.trim() === '') &&
      (output.summary === undefined ||
        output.summary === null ||
        output.summary.trim() === '')
    )
  }

  private getNonActionsOutputMD(
    output: IRefCheckOutput,
    checkRunName: string
  ): string | null {
    const { title, summary } = output

    const titleOutput =
      title !== null &&
      title.trim() !== '' &&
      title.trim().toLocaleLowerCase() !==
        checkRunName.trim().toLocaleLowerCase()
        ? `### ${title.trim()}\n`
        : ''

    const summaryOutput =
      summary !== null && summary !== undefined && summary.trim() !== ''
        ? summary
        : ''

    const mainOutput =
      output.type !== RefCheckOutputType.Actions && output.text !== null
        ? output.text.trim()
        : ''

    const combinedOutput = titleOutput + summaryOutput + mainOutput
    return combinedOutput === '' ? null : combinedOutput
  }

  private renderNonActionsLogOutput = (
    output: IRefCheckOutput,
    checkRunName: string
  ) => {
    if (this.isOutputToDisplay(output)) {
      return this.renderEmptyLogOutput()
    }

    const markdown = this.getNonActionsOutputMD(output, checkRunName)
    if (output.type === RefCheckOutputType.Actions || markdown === null) {
      return null
    }

    return (
      <SandboxedMarkdown
        markdown={markdown}
        baseHref={this.props.baseHref}
        onMarkdownLinkClicked={this.props.onMarkdownLinkClicked}
      />
    )
  }

  private renderEmptyLogOutput = () => {
    return (
      <div className="no-logs-to-display">
        No additional information to display.
      </div>
    )
  }

  private renderLoadingLogs = () => {
    return <div className="no-logs-to-display">Loading…</div>
  }

  private hasActionsWorkflowLogs() {
    return this.props.checkRun.actionsWorkflowRunId !== undefined
  }

  public render() {
    const {
      loadingActionWorkflows,
      loadingActionLogs,
      checkRun: { output, name },
    } = this.props

    if (loadingActionWorkflows) {
      return this.renderLoadingLogs()
    }

    const logsOutput = this.hasActionsWorkflowLogs() ? (
      <CICheckRunActionLogs output={output} loadingLogs={loadingActionLogs} />
    ) : (
      this.renderNonActionsLogOutput(output, name)
    )

    const className = classNames('ci-check-list-item-logs', {
      actions: this.hasActionsWorkflowLogs(),
    })

    return (
      <div
        className={className}
        onMouseOver={this.props.onMouseOver}
        onMouseLeave={this.props.onMouseLeave}
      >
        <div className="ci-check-list-item-logs-output">{logsOutput}</div>
      </div>
    )
  }
}
