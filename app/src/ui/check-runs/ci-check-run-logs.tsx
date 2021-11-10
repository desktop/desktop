import * as React from 'react'
import {
  IRefCheck,
  IRefCheckOutput,
  RefCheckOutputType,
} from '../../lib/ci-checks/ci-checks'
import classNames from 'classnames'
import { CICheckRunActionLogs } from './ci-check-run-actions-logs'
import { SandboxedMarkdown } from '../lib/sandboxed-markdown'
import { enableCICheckRunsLogs } from '../../lib/feature-flag'
import { LinkButton } from '../lib/link-button'
import { encodePathAsUrl } from '../../lib/path'

const PaperStackImage = encodePathAsUrl(__dirname, 'static/paper-stack.svg')

interface ICICheckRunLogsProps {
  /** The check run to display **/
  readonly checkRun: IRefCheck

  /** The base href used for relative links provided in check run markdown
   * output */
  readonly baseHref: string | null

  /** Callback to opens check runs on GitHub */
  readonly onMouseOver: (mouseEvent: React.MouseEvent<HTMLDivElement>) => void

  /** Callback to opens check runs on GitHub */
  readonly onMouseLeave: (mouseEvent: React.MouseEvent<HTMLDivElement>) => void

  /** Callback to open URL's originating from markdown */
  readonly onMarkdownLinkClicked: (url: string) => void

  /** Callback to open check run target url (maybe GitHub, maybe third party check run)*/
  readonly onViewCheckDetails: () => void
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
    if (this.isOutputToDisplay(output) || !enableCICheckRunsLogs()) {
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
        <div className="text">
          There is no output data to display for this check.
          <div>
            <LinkButton onClick={this.props.onViewCheckDetails}>
              {this.props.checkRun.htmlUrl !== null
                ? 'View check details'
                : 'View check pull request'}
            </LinkButton>
          </div>
        </div>
        <img src={PaperStackImage} className="blankslate-image" />
      </div>
    )
  }

  private hasActionsWorkflowLogs() {
    return this.props.checkRun.actionsWorkflowRunId !== undefined
  }

  public render() {
    const {
      checkRun: { output, name },
    } = this.props

    const logsOutput = this.hasActionsWorkflowLogs() ? (
      <CICheckRunActionLogs output={output} />
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
