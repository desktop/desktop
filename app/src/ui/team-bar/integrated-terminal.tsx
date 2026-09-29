import * as React from 'react'
import { Terminal as XTermTerminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { IpcRendererEvent } from 'electron'
import * as ipcRenderer from '../../lib/ipc-renderer'
import { getMonospaceFontFamily } from '../get-monospace-font-family'

interface IIntegratedTerminalProps {
  /** The directory to start the shell in, null for the home directory */
  readonly cwd: string | null

  /** Whether the terminal is currently shown */
  readonly visible: boolean

  /** Called when the shell exits */
  readonly onExit?: (exitCode: number) => void
}

function getCssVariable(name: string, fallback: string) {
  const value = getComputedStyle(document.body).getPropertyValue(name).trim()
  return value.length > 0 ? value : fallback
}

/**
 * An interactive terminal running the user's shell (Windows PowerShell on
 * Windows, the login shell on macOS and Linux) in a pseudo terminal owned by
 * the main process.
 */
export class IntegratedTerminal extends React.Component<IIntegratedTerminalProps> {
  private readonly containerRef = React.createRef<HTMLDivElement>()
  private terminal: XTermTerminal | null = null
  private fitAddon: FitAddon | null = null
  private resizeObserver: ResizeObserver | null = null
  private sessionId: number | null = null
  private disposed = false

  public async componentDidMount() {
    const container = this.containerRef.current
    if (container === null) {
      return
    }

    const terminal = new XTermTerminal({
      fontFamily: getMonospaceFontFamily(),
      fontSize: 12,
      cursorBlink: true,
      allowProposedApi: false,
      scrollback: 5000,
      theme: {
        background: getCssVariable('--background-color', '#1e1e1e'),
        foreground: getCssVariable('--text-color', '#d4d4d4'),
        cursor: getCssVariable('--text-color', '#d4d4d4'),
        selectionBackground: getCssVariable(
          '--box-selected-background-color',
          '#264f78'
        ),
      },
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(container)

    this.terminal = terminal
    this.fitAddon = fitAddon
    this.fit()

    ipcRenderer.on('integrated-terminal-data', this.onData)
    ipcRenderer.on('integrated-terminal-exit', this.onPtyExit)

    terminal.onData(data => {
      if (this.sessionId !== null) {
        ipcRenderer.send('integrated-terminal-write', this.sessionId, data)
      }
    })

    this.resizeObserver = new ResizeObserver(() => this.fit())
    this.resizeObserver.observe(container)

    try {
      const id = await ipcRenderer.invoke('integrated-terminal-create', {
        cwd: this.props.cwd,
        cols: terminal.cols,
        rows: terminal.rows,
      })

      if (this.disposed) {
        ipcRenderer.send('integrated-terminal-kill', id)
        return
      }

      this.sessionId = id
      this.fit()
      if (this.props.visible) {
        terminal.focus()
      }
    } catch (e) {
      log.error('Failed to start the integrated terminal', e)
      terminal.writeln('ターミナルを起動できませんでした。')
      terminal.writeln(`${e}`)
    }
  }

  public componentDidUpdate(prevProps: IIntegratedTerminalProps) {
    if (this.props.visible && !prevProps.visible) {
      this.fit()
      this.terminal?.focus()
    }
  }

  public componentWillUnmount() {
    this.disposed = true
    this.resizeObserver?.disconnect()
    ipcRenderer.removeListener('integrated-terminal-data', this.onData)
    ipcRenderer.removeListener('integrated-terminal-exit', this.onPtyExit)

    if (this.sessionId !== null) {
      ipcRenderer.send('integrated-terminal-kill', this.sessionId)
      this.sessionId = null
    }

    this.terminal?.dispose()
    this.terminal = null
  }

  public focus() {
    this.terminal?.focus()
  }

  private fit() {
    const { terminal, fitAddon } = this
    const container = this.containerRef.current

    // The fit addon can't measure a hidden terminal
    if (
      terminal === null ||
      fitAddon === null ||
      container === null ||
      !this.props.visible ||
      container.clientWidth === 0 ||
      container.clientHeight === 0
    ) {
      return
    }

    fitAddon.fit()

    if (this.sessionId !== null) {
      ipcRenderer.send(
        'integrated-terminal-resize',
        this.sessionId,
        terminal.cols,
        terminal.rows
      )
    }
  }

  private onData = (_: IpcRendererEvent, id: number, data: string) => {
    if (id === this.sessionId) {
      this.terminal?.write(data)
    }
  }

  private onPtyExit = (_: IpcRendererEvent, id: number, exitCode: number) => {
    if (id !== this.sessionId) {
      return
    }

    this.sessionId = null
    this.terminal?.writeln('')
    this.terminal?.writeln(
      `\x1b[2m[プロセスが終了しました (コード ${exitCode})]\x1b[0m`
    )
    this.props.onExit?.(exitCode)
  }

  public render() {
    return <div className="integrated-terminal" ref={this.containerRef} />
  }
}
