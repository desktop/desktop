import * as React from 'react'
import {
  getCheckDurationInSeconds,
  IRefCheck,
  IRefCheckOutput,
  RefCheckOutputType,
} from '../../lib/stores/commit-status-store'

import { Octicon } from '../octicons'
import { getClassNameForCheck, getSymbolForCheck } from './ci-status'
import classNames from 'classnames'
import { APICheckConclusion } from '../../lib/api'
import { Button } from '../lib/button'
import { encodePathAsUrl } from '../../lib/path'
import { SandboxedMarkdown } from '../lib/sandboxed-markdown'

// TODO: Get empty graphic for logs?
const BlankSlateImage = encodePathAsUrl(
  __dirname,
  'static/empty-no-pull-requests.svg'
)

interface ICICheckRunListItemProps {
  /** The check run to display **/
  readonly checkRun: IRefCheck

  /** Whether call for actions logs is pending */
  readonly loadingLogs: boolean

  /** Whether to show the logs for this check run */
  readonly showLogs: boolean

  /** The base href used for relative links provided in check run markdown
   * output */
  readonly baseHref: string | null

  /** Callback for when a check run is clicked */
  readonly onCheckRunClick: (checkRun: IRefCheck) => void

  /** Callback to opens check runs on GitHub */
  readonly onViewOnGitHub: (checkRun: IRefCheck) => void
}

/** The CI check list item. */
export class CICheckRunListItem extends React.PureComponent<
  ICICheckRunListItemProps
> {
  private onCheckRunClick = () => {
    this.props.onCheckRunClick(this.props.checkRun)
  }

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

  private isNoOutputText(output: IRefCheckOutput): boolean {
    return (
      output.type === RefCheckOutputType.Default &&
      (output.text === null || output.text.trim() === '')
    )
  }

  private renderActionsLogOutput = (output: IRefCheckOutput) => {
    if (output.type === RefCheckOutputType.Default) {
      return null
    }

    return output.steps.map((step, i) => {
      const header = (
        <div className="ci-check-run-log-step" key={i}>
          <div className="ci-check-status-symbol">
            <Octicon
              className={classNames(
                'ci-status',
                `ci-status-${getClassNameForCheck(step)}`
              )}
              symbol={getSymbolForCheck(step)}
              title={step.name}
            />
          </div>
          <div className="ci-check-run-log-step-name">{step.name}</div>
          <div>{getCheckDurationInSeconds(step)}s</div>
        </div>
      )

      const log =
        step.conclusion === APICheckConclusion.Failure ? step.log : null

      return (
        <>
          {header}
          {log}
        </>
      )
    })
  }

  private renderNonActionsLogOutput = (output: IRefCheckOutput) => {
    if (output.type === RefCheckOutputType.Actions || output.text === null) {
      return null
    }

    // TODO: Html needs santized. Later PR
    return <div dangerouslySetInnerHTML={{ __html: output.text }}></div>
  }

  private markDownLinkClicked = (link: string): void => {
    console.log(link)
  }

  private renderMetaOutput = (
    output: IRefCheckOutput,
    checkRunName: string
  ) => {
    const { title, summary } = output

    // Don't display something empty or redundant
    const displayTitle =
      title !== null &&
      title.trim() !== '' &&
      title.trim().toLocaleLowerCase() !==
        checkRunName.trim().toLocaleLowerCase()

    return (
      <div>
        {displayTitle ? <h2>{title}</h2> : null}
        {summary !== null && summary !== undefined && summary.trim() !== '' ? (
          <SandboxedMarkdown
            markdown={summary}
            baseHref={this.props.baseHref}
            onMarkdownLinkClicked={this.markDownLinkClicked}
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
    return (
      <div className="loading-logs">
        <img src={BlankSlateImage} className="blankslate-image" />
        <div className="title">Hang tight</div>
        <div className="loading-blurb">Loading the logs as fast as I can!</div>
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

  private renderLogs = () => {
    const {
      loadingLogs,
      checkRun: { output, name },
    } = this.props

    if (loadingLogs && this.isNoOutputText(output)) {
      return this.renderLoadingLogs()
    }

    return (
      <div className="ci-check-list-item-logs">
        <div className="ci-check-list-item-logs-output">
          {this.isNoAdditionalInfoToDisplay(output)
            ? this.renderEmptyLogOutput()
            : null}
          {this.renderMetaOutput(output, name)}
          {this.renderActionsLogOutput(output)}
          {this.renderNonActionsLogOutput(output)}
        </div>
        {this.renderViewOnGitHub()}
      </div>
    )
  }

  public render() {
    const { checkRun, showLogs } = this.props

    return (
      <>
        <div
          className="ci-check-list-item list-item"
          onClick={this.onCheckRunClick}
        >
          <div className="ci-check-status-symbol">
            <Octicon
              className={classNames(
                'ci-status',
                `ci-status-${getClassNameForCheck(checkRun)}`
              )}
              symbol={getSymbolForCheck(checkRun)}
              title={checkRun.description}
            />
          </div>

          <div className="ci-check-list-item-detail">
            <div className="ci-check-name">{checkRun.name}</div>
            <div className="ci-check-description" title={checkRun.description}>
              {checkRun.description}
            </div>
          </div>
        </div>
        {showLogs ? this.renderLogs() : null}
      </>
    )
  }
}
