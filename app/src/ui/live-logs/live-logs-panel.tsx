import * as React from 'react'
import classNames from 'classnames'
import { clipboard } from 'electron'
import { Button } from '../lib/button'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

interface ILiveLogsPanelProps {
  /** Raw Git output chunks/lines to display. */
  readonly logs: ReadonlyArray<string>

  /** Called when the user clicks Clear. */
  readonly onClear: () => void

  /** Whether the panel starts expanded. Defaults to true. */
  readonly initiallyExpanded?: boolean
}

interface ILiveLogsPanelState {
  readonly isExpanded: boolean
}

/**
 * A collapsible bottom bar that displays recent raw Git output in a
 * terminal-style view with Clear and Copy actions.
 */
export class LiveLogsPanel extends React.Component<
  ILiveLogsPanelProps,
  ILiveLogsPanelState
> {
  private logContainerRef = React.createRef<HTMLPreElement>()

  public constructor(props: ILiveLogsPanelProps) {
    super(props)

    this.state = {
      isExpanded: props.initiallyExpanded ?? true,
    }
  }

  public componentDidUpdate(prevProps: ILiveLogsPanelProps) {
    if (
      this.state.isExpanded &&
      prevProps.logs !== this.props.logs &&
      this.props.logs.length > 0
    ) {
      this.scrollToBottom()
    }
  }

  public componentDidMount() {
    if (this.state.isExpanded && this.props.logs.length > 0) {
      this.scrollToBottom()
    }
  }

  private scrollToBottom() {
    const container = this.logContainerRef.current
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  }

  private onToggleExpanded = () => {
    this.setState(
      prev => ({ isExpanded: !prev.isExpanded }),
      () => {
        if (this.state.isExpanded) {
          this.scrollToBottom()
        }
      }
    )
  }

  private onClear = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    this.props.onClear()
  }

  private onCopy = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    clipboard.writeText(this.props.logs.join(''))
  }

  private get logText(): string {
    return this.props.logs.join('')
  }

  private get hasLogs(): boolean {
    return this.logText.length > 0
  }

  public render() {
    const { isExpanded } = this.state
    const className = classNames('live-logs-panel', {
      expanded: isExpanded,
      collapsed: !isExpanded,
    })

    return (
      <div className={className}>
        <div className="live-logs-panel-header">
          <button
            type="button"
            className="live-logs-panel-toggle"
            onClick={this.onToggleExpanded}
            aria-expanded={isExpanded}
            aria-controls="live-logs-panel-content"
          >
            <Octicon
              symbol={isExpanded ? octicons.chevronDown : octicons.chevronUp}
            />
            <span className="live-logs-panel-title">Git Output</span>
          </button>
          <div className="live-logs-panel-actions">
            <Button
              onClick={this.onCopy}
              disabled={!this.hasLogs}
              size="small"
              tooltip="Copy logs to clipboard"
              ariaLabel="Copy logs to clipboard"
            >
              Copy
            </Button>
            <Button
              onClick={this.onClear}
              disabled={!this.hasLogs}
              size="small"
              tooltip="Clear logs"
              ariaLabel="Clear logs"
            >
              Clear
            </Button>
          </div>
        </div>
        {isExpanded && (
          <pre
            id="live-logs-panel-content"
            className="live-logs-panel-content"
            ref={this.logContainerRef}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
          >
            {this.hasLogs ? (
              this.logText
            ) : (
              <span className="live-logs-panel-empty">
                No Git output yet. Logs will appear here as commands run.
              </span>
            )}
          </pre>
        )}
      </div>
    )
  }
}
