import * as React from 'react'
import classNames from 'classnames'
import {
  ITeamLink,
  TeamLinkIcon,
  teamLinks,
  teamName,
} from '../../lib/team-links'
import { IntegratedTerminal } from './integrated-terminal'
import { Button } from '../lib/button'
import { Octicon, OcticonSymbol } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

const teamLinkIcons: Record<TeamLinkIcon, OcticonSymbol> = {
  folder: octicons.fileDirectory,
  build: octicons.archive,
  calendar: octicons.calendar,
  repo: octicons.repo,
  document: octicons.book,
  docs: octicons.note,
  chat: octicons.commentDiscussion,
}

interface ITeamBarProps {
  /**
   * The directory new terminal sessions start in, typically the path of the
   * selected repository. Null for the home directory.
   */
  readonly terminalCwd: string | null

  /** Open the given URL in the user's browser */
  readonly onOpenURL: (url: string) => void
}

interface ITeamBarState {
  /** Whether the terminal panel is shown */
  readonly terminalOpen: boolean

  /**
   * Whether the terminal has been opened at least once. The terminal stays
   * mounted (keeping the shell alive) while the panel is hidden.
   */
  readonly terminalStarted: boolean

  /** Incremented to start a new shell session */
  readonly sessionKey: number

  /** The directory the current session was started in */
  readonly sessionCwd: string | null

  readonly terminalHeight: number
}

const terminalHeightKey = 'team-bar-terminal-height'
const minTerminalHeight = 120
const defaultTerminalHeight = 260

function loadTerminalHeight() {
  try {
    const value = parseInt(localStorage.getItem(terminalHeightKey) ?? '', 10)
    return isNaN(value)
      ? defaultTerminalHeight
      : Math.max(value, minTerminalHeight)
  } catch {
    return defaultTerminalHeight
  }
}

const isToggleTerminalShortcut = (e: KeyboardEvent) =>
  e.ctrlKey &&
  !e.altKey &&
  !e.metaKey &&
  (e.key === '`' || e.code === 'Backquote')

interface ITeamLinkButtonProps {
  readonly link: ITeamLink
  readonly onOpenURL: (url: string) => void
}

/** A button in the team bar which opens one of the team's links */
class TeamLinkButton extends React.Component<ITeamLinkButtonProps> {
  private onClick = () => this.props.onOpenURL(this.props.link.url)

  public render() {
    const { link } = this.props
    return (
      <Button
        className="team-bar-button team-link"
        onClick={this.onClick}
        tooltip={`${link.description}\n${link.url}`}
      >
        <Octicon className="team-link-icon" symbol={teamLinkIcons[link.icon]} />
        {link.label}
      </Button>
    )
  }
}

/**
 * The bar at the bottom of the window with the team's links on the left and
 * a toggle for the integrated terminal panel (shown above the bar) on the
 * right.
 */
export class TeamBar extends React.Component<ITeamBarProps, ITeamBarState> {
  private readonly terminalRef = React.createRef<IntegratedTerminal>()
  private dragStart: { y: number; height: number } | null = null

  public constructor(props: ITeamBarProps) {
    super(props)
    this.state = {
      terminalOpen: false,
      terminalStarted: false,
      sessionKey: 0,
      sessionCwd: props.terminalCwd,
      terminalHeight: loadTerminalHeight(),
    }
  }

  public componentDidMount() {
    window.addEventListener('keydown', this.onKeyDown)
  }

  public componentWillUnmount() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('mousemove', this.onDragMove)
    window.removeEventListener('mouseup', this.onDragEnd)
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (isToggleTerminalShortcut(e)) {
      e.preventDefault()
      this.toggleTerminal()
    }
  }

  private toggleTerminal = () => {
    this.setState(state => ({
      terminalOpen: !state.terminalOpen,
      terminalStarted: true,
      // Start in the selected repository the first time the panel is opened
      sessionCwd: state.terminalStarted
        ? state.sessionCwd
        : this.props.terminalCwd,
    }))
  }

  private closeTerminal = () => {
    this.setState({ terminalOpen: false })
  }

  private restartTerminal = () => {
    this.setState(state => ({
      sessionKey: state.sessionKey + 1,
      sessionCwd: this.props.terminalCwd,
    }))
  }

  private onDragStart = (e: React.MouseEvent) => {
    e.preventDefault()
    this.dragStart = { y: e.clientY, height: this.state.terminalHeight }
    window.addEventListener('mousemove', this.onDragMove)
    window.addEventListener('mouseup', this.onDragEnd)
  }

  private onDragMove = (e: MouseEvent) => {
    if (this.dragStart === null) {
      return
    }

    const maxHeight = Math.max(minTerminalHeight, window.innerHeight * 0.75)
    const height = this.dragStart.height + (this.dragStart.y - e.clientY)
    this.setState({
      terminalHeight: Math.round(
        Math.min(Math.max(height, minTerminalHeight), maxHeight)
      ),
    })
  }

  private onDragEnd = () => {
    this.dragStart = null
    window.removeEventListener('mousemove', this.onDragMove)
    window.removeEventListener('mouseup', this.onDragEnd)
    try {
      localStorage.setItem(terminalHeightKey, `${this.state.terminalHeight}`)
    } catch {
      // Remembering the height is only a convenience
    }
  }

  private renderTerminalPanel() {
    const { terminalOpen, terminalStarted, sessionKey, sessionCwd } = this.state

    if (!terminalStarted) {
      return null
    }

    const shellName = __WIN32__
      ? 'PowerShell'
      : __DARWIN__
      ? 'Terminal'
      : 'Shell'

    return (
      <div
        className={classNames('team-terminal-panel', { hidden: !terminalOpen })}
        style={{ height: this.state.terminalHeight }}
      >
        <button
          // Prevent form submission with this button
          type="button"
          tabIndex={-1}
          className="team-terminal-resize-handle"
          onMouseDown={this.onDragStart}
          aria-label="ターミナルの高さを変更"
        />
        <div className="team-terminal-header">
          <span className="team-terminal-title">
            {shellName}
            {sessionCwd !== null && (
              <span className="team-terminal-cwd">{sessionCwd}</span>
            )}
          </span>
          <Button
            className="team-bar-button"
            onClick={this.restartTerminal}
            tooltip="選択中のリポジトリで新しいセッションを開始"
          >
            <Octicon symbol={octicons.sync} />
            新しいセッション
          </Button>
          <Button
            className="team-bar-button"
            onClick={this.closeTerminal}
            tooltip="ターミナルを隠す (Ctrl+`)"
            ariaLabel="ターミナルを隠す"
          >
            <Octicon symbol={octicons.x} />
          </Button>
        </div>
        <IntegratedTerminal
          key={sessionKey}
          ref={this.terminalRef}
          cwd={sessionCwd}
          visible={terminalOpen}
        />
      </div>
    )
  }

  private renderLink = (link: ITeamLink) => (
    <TeamLinkButton
      key={link.url}
      link={link}
      onOpenURL={this.props.onOpenURL}
    />
  )

  public render() {
    const { terminalOpen } = this.state

    return (
      <>
        {this.renderTerminalPanel()}
        <div id="team-bar" role="toolbar" aria-label="チームリンク">
          <span className="team-badge">{teamName}</span>
          <nav className="team-links">{teamLinks.map(this.renderLink)}</nav>
          <span className="team-bar-spacer" />
          <Button
            className={classNames('team-bar-button', 'team-terminal-toggle', {
              active: terminalOpen,
            })}
            onClick={this.toggleTerminal}
            tooltip="ターミナルを開く / 閉じる (Ctrl+`)"
            ariaPressed={terminalOpen}
          >
            <Octicon symbol={octicons.terminal} />
            ターミナル
          </Button>
        </div>
      </>
    )
  }
}
