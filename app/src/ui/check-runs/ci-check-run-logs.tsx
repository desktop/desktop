import * as React from 'react'
import {
  IRefCheck,
  IRefCheckOutput,
  RefCheckOutputType,
} from '../../lib/ci-checks/ci-checks'
import classNames from 'classnames'
import { Button } from '../lib/button'
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
  readonly onViewOnGitHub: (checkRun: IRefCheck) => void

  /** Callback to open URL's originating from markdown */
  readonly onMarkdownLinkClicked: (url: string) => void
}

/** The CI check list item. */
export class CICheckRunLogs extends React.PureComponent<ICICheckRunLogsProps> {
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

  private getNonActionsOutputMD(output: IRefCheckOutput): string | null {
    const mainOutput =
      output.type !== RefCheckOutputType.Actions && output.text !== null
        ? output.text.trim()
        : ''
    const summaryOutput =
      output.summary !== null &&
      output.summary !== undefined &&
      output.summary.trim() !== ''
        ? output.summary
        : ''
    const combinedOutput = summaryOutput + mainOutput
    return combinedOutput === '' ? null : combinedOutput
  }

  private renderNonActionsLogOutput = (output: IRefCheckOutput) => {
    const markdown = this.getNonActionsOutputMD(output)
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

    const cleanSummary =
      summary !== null && summary !== undefined && summary.trim() !== ''
        ? summary.trim()
        : ''
    const renderSummary =
      cleanSummary !== '' &&
      // For actions types, we will render it here - for non action types we
      // will combine with output markdown so we only have one iframe.
      output.type === RefCheckOutputType.Actions

    return (
      <div className="meta-output">
        {displayTitle ? <h4>{title}</h4> : null}
        {renderSummary ? (
          <SandboxedMarkdown
            markdown={cleanSummary}
            baseHref={this.props.baseHref}
            onMarkdownLinkClicked={this.props.onMarkdownLinkClicked}
          />
        ) : null}
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

  private renderLoadingLogs = () => {
    return <div className="no-logs-to-display">Loading…</div>
  }

  private renderViewOnGitHub = () => {
    return (
      <div className="view-on-github">
        <Button onClick={this.onViewOnGitHub}>View on GitHub</Button>
      </div>
    )
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
