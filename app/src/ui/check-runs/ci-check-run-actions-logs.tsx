import * as React from 'react'
import {
  getFormattedCheckRunDuration,
  IRefCheckOutput,
  RefCheckOutputType,
} from '../../lib/stores/commit-status-store'

import { Octicon } from '../octicons'
import classNames from 'classnames'
import * as OcticonSymbol from '../octicons/octicons.generated'
import {
  getClassNameForLogStep,
  getSymbolForLogStep,
} from '../branches/ci-status'
import { ActionsLogParser } from '../../lib/actions-log-parser/action-log-parser'
import {
  ILogLineTemplateData,
  IParsedContent,
} from '../../lib/actions-log-parser/actions-log-parser-objects'
import { IAPIWorkflowJobStep } from '../../lib/api'

const MIN_LOG_LINE_NUMBER_WIDTH = 25 // makes numbers line up with chevron
const MAX_LOG_LINE_NUMBER_WIDTH = 100 // arbitrarily chosen
const INDIVIDUAL_LOG_LINE_NUMBER_WIDTH_ALLOWED = 10

interface ICICheckRunActionLogsProps {
  /** The check run to display **/
  readonly output: IRefCheckOutput

  /** Whether call for actions logs is pending */
  readonly loadingLogs: boolean
}

interface ICICheckRunActionLogsState {
  readonly openSections: ReadonlySet<number>
}

export class CICheckRunActionLogs extends React.PureComponent<
  ICICheckRunActionLogsProps,
  ICICheckRunActionLogsState
> {
  private logLineNumberWidth = MIN_LOG_LINE_NUMBER_WIDTH

  public constructor(props: ICICheckRunActionLogsProps) {
    super(props)
    this.state = {
      openSections: new Set<number>(),
    }
  }

  public toggleOpenState = (index: number) => {
    return () => {
      const openSections = new Set(this.state.openSections)
      if (openSections.has(index)) {
        openSections.delete(index)
      } else {
        openSections.add(index)
      }

      this.setState({ openSections })
    }
  }

  private calculateLineLogNumberWidth(
    logLinesData: ReadonlyArray<ILogLineTemplateData>
  ): void {
    if (logLinesData.length === 0) {
      this.logLineNumberWidth = MIN_LOG_LINE_NUMBER_WIDTH
      return
    }

    const lastLine = logLinesData[logLinesData.length - 1]
    const calcWidth =
      lastLine.lineNumber.toString().length *
      INDIVIDUAL_LOG_LINE_NUMBER_WIDTH_ALLOWED

    this.logLineNumberWidth = Math.min(
      MAX_LOG_LINE_NUMBER_WIDTH,
      Math.max(MIN_LOG_LINE_NUMBER_WIDTH, calcWidth)
    )
  }

  private renderLogs(log: string | undefined): JSX.Element | null {
    if (log === undefined) {
      return null
    }

    const logParser = new ActionsLogParser(log, '')
    const logLinesData = logParser.getParsedLogLinesTemplateData()
    this.calculateLineLogNumberWidth(logLinesData)

    const logLineJSX: JSX.Element[] = []

    let logGroup: ILogLineTemplateData[] = []
    for (let i = 0; i < logLinesData.length; i++) {
      const lineData = logLinesData[i]
      const isNextLineDataInGroup = logLinesData[i + 1]?.inGroup

      // We simply have a regular log line
      if (!lineData.isGroup && !lineData.inGroup) {
        logLineJSX.push(this.renderLogLine(lineData, i))
        continue
      }

      // Otherwise this line is part of a group
      logGroup.push(lineData)

      // If the currently line is the last in the group, then we want to render
      // the group
      if (!isNextLineDataInGroup) {
        logLineJSX.push(this.renderLogLineGroup(logGroup, i))
        logGroup = []
      }
    }

    return <div className="ci-check-run-step-log-display">{logLineJSX}</div>
  }

  private renderLogLineGroup(
    logGroup: ILogLineTemplateData[],
    index: number
  ): JSX.Element {
    const logGroupSummary = logGroup[0]
    const logGroupBody = logGroup.slice(1).map((lineData, i) => {
      return this.renderLogLine(lineData, i, true)
    })

    const cn = classNames('line', logGroupSummary.className)
    return (
      <div className={cn} key={index}>
        {this.renderLogLineNumber(logGroupSummary.lineNumber)}
        <details className="log-group" open={logGroupSummary.groupExpanded}>
          <summary>
            {this.renderLogLineContentTemplate(logGroupSummary)}
          </summary>
          {logGroupBody}
        </details>
      </div>
    )
  }

  private renderLogLine(
    lineData: ILogLineTemplateData,
    index: number,
    isInGroup: boolean = false
  ): JSX.Element {
    const cn = classNames('line', lineData.className)
    const style = isInGroup
      ? // Meh... the +10 is due to the margin-left of the log group = var(--spacing).... if this changes oh no.. we broke
        { marginLeft: -1 * (this.logLineNumberWidth + 10) }
      : undefined
    return (
      <div className={cn} key={index} style={style}>
        {this.renderLogLineNumber(lineData.lineNumber)}
        {this.renderLogLineContentTemplate(lineData)}
      </div>
    )
  }

  private renderLogLineNumber(lineNumber: number): JSX.Element {
    const style = { width: this.logLineNumberWidth }
    return (
      <span className="line-number" style={style}>
        {lineNumber}
      </span>
    )
  }

  private renderLogLineContentTemplate(
    lineData: ILogLineTemplateData
  ): JSX.Element {
    let contentPrefixClassName: string | undefined
    let contentPrefixAdj: string | undefined

    if (lineData.isError) {
      contentPrefixClassName = 'error-text'
      contentPrefixAdj = 'Error'
    } else if (lineData.isWarning) {
      contentPrefixClassName = 'warning-text'
      contentPrefixAdj = 'Warning'
    } else if (lineData.isNotice) {
      contentPrefixClassName = 'notice-text'
      contentPrefixAdj = 'Notice'
    }

    return (
      <span className="line-content">
        {contentPrefixAdj && contentPrefixClassName ? (
          <span className={contentPrefixClassName}>{contentPrefixAdj}: </span>
        ) : null}
        {this.renderLogLineInnerContent(lineData.lineContent)}
      </span>
    )
  }

  private renderLogLineInnerContent(
    data: ReadonlyArray<IParsedContent>
  ): JSX.Element[] {
    return data.map((d, i) => {
      const output = d.output.map((v, i) => {
        return (
          <span key={i}>
            {v.entry}
            {v.entryUrl !== undefined ? (
              <a target="_blank" rel="noopener noreferrer" href={v.entryUrl}>
                {v.entryUrl}
              </a>
            ) : null}
            {v.afterUrl}
          </span>
        )
      })

      return (
        <span key={i}>
          <span className={classNames(...d.classes)}>{output}</span>
        </span>
      )
    })
  }

  private renderStepHeader(
    step: IAPIWorkflowJobStep,
    isSkipped: boolean,
    showLogs: boolean,
    index: number
  ): JSX.Element {
    const headerClassNames = classNames('ci-check-run-log-step-header', {
      open: showLogs,
    })

    return (
      <div className={headerClassNames} onClick={this.toggleOpenState(index)}>
        <div className="ci-check-run-log-step-header-container">
          {!isSkipped ? (
            <Octicon
              className="log-step-toggled-indicator"
              symbol={
                showLogs
                  ? OcticonSymbol.chevronDown
                  : OcticonSymbol.chevronRight
              }
              title={step.name}
            />
          ) : (
            <span className="no-toggle"></span>
          )}

          <Octicon
            className={classNames(
              'log-step-status',
              `ci-status-${getClassNameForLogStep(step)}`
            )}
            symbol={getSymbolForLogStep(step)}
            title={step.name}
          />
          <div className="ci-check-run-log-step-name">{step.name}</div>
          <div>{getFormattedCheckRunDuration(step)}</div>
        </div>
      </div>
    )
  }

  public render() {
    const { output, loadingLogs } = this.props

    if (loadingLogs) {
      return <>Loading…</>
    }

    if (output.type !== RefCheckOutputType.Actions) {
      // This shouldn't happen, should only be provided actions type
      return <>Unable to load logs.</>
    }

    return output.steps.map((step, i) => {
      const isSkipped = step.conclusion === 'skipped'
      const showLogs = this.state.openSections.has(i) && !isSkipped

      return (
        <div className="ci-check-run-log-step" key={i}>
          {this.renderStepHeader(step, isSkipped, showLogs, i)}
          {showLogs ? this.renderLogs(step.log) : null}
        </div>
      )
    })
  }
}
