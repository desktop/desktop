import * as React from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import * as ipcRenderer from '../../lib/ipc-renderer'
import '@xterm/xterm/css/xterm.css'

interface ITerminalProps {
  /** Terminal ID from main process */
  readonly terminalId: string
  /** Working directory for the terminal */
  readonly cwd: string
  /** Whether this terminal tab is active */
  readonly isActive: boolean
  /** Callback when terminal exits */
  readonly onExit?: (exitCode: number) => void
}

interface ITerminalState {
  readonly isReady: boolean
}

export class Terminal extends React.Component<ITerminalProps, ITerminalState> {
  private containerRef = React.createRef<HTMLDivElement>()
  private xterm: XTerm | null = null
  private fitAddon: FitAddon | null = null
  private resizeObserver: ResizeObserver | null = null
  private dataHandler: ((event: Electron.IpcRendererEvent, id: string, data: string) => void) | null = null
  private exitHandler: ((event: Electron.IpcRendererEvent, id: string, exitCode: number) => void) | null = null

  public constructor(props: ITerminalProps) {
    super(props)
    this.state = { isReady: false }
  }

  public componentDidMount() {
    this.initializeTerminal()
  }

  public componentDidUpdate(prevProps: ITerminalProps) {
    if (this.props.isActive && !prevProps.isActive) {
      // Terminal became active, fit to container
      this.fitTerminal()
      this.xterm?.focus()
    }
  }

  public componentWillUnmount() {
    this.cleanup()
  }

  private async initializeTerminal() {
    if (!this.containerRef.current) {
      return
    }

    // Create xterm instance
    this.xterm = new XTerm({
      cursorBlink: true,
      fontFamily: 'var(--font-family-monospace)',
      fontSize: 13,
      lineHeight: 1.2,
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        cursorAccent: '#1e1e1e',
        selectionBackground: '#264f78',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#e5e5e5',
      },
    })

    this.fitAddon = new FitAddon()
    this.xterm.loadAddon(this.fitAddon)

    // Open terminal in container
    this.xterm.open(this.containerRef.current)
    this.fitTerminal()

    // Set up IPC listeners for terminal data
    this.dataHandler = (_event, id: string, data: string) => {
      if (id === this.props.terminalId && this.xterm) {
        this.xterm.write(data)
      }
    }

    this.exitHandler = (_event, id: string, exitCode: number) => {
      if (id === this.props.terminalId) {
        this.props.onExit?.(exitCode)
      }
    }

    ipcRenderer.on('terminal-data', this.dataHandler)
    ipcRenderer.on('terminal-exit', this.exitHandler)

    // Send user input to main process
    // The script command creates a real PTY that handles echo
    this.xterm.onData(data => {
      ipcRenderer.invoke('terminal-write', this.props.terminalId, data)
    })

    // Handle resize
    this.xterm.onResize(({ cols, rows }) => {
      ipcRenderer.invoke('terminal-resize', this.props.terminalId, cols, rows)
    })

    // Set up resize observer
    this.resizeObserver = new ResizeObserver(() => {
      this.fitTerminal()
    })
    this.resizeObserver.observe(this.containerRef.current)

    this.setState({ isReady: true })

    // Focus if active
    if (this.props.isActive) {
      this.xterm.focus()
    }
  }

  private fitTerminal() {
    if (this.fitAddon && this.xterm) {
      try {
        this.fitAddon.fit()
      } catch (e) {
        // Ignore fit errors when container is not visible
      }
    }
  }

  private cleanup() {
    if (this.dataHandler) {
      ipcRenderer.removeListener('terminal-data', this.dataHandler)
    }
    if (this.exitHandler) {
      ipcRenderer.removeListener('terminal-exit', this.exitHandler)
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
    }
    if (this.xterm) {
      this.xterm.dispose()
    }

    // Kill the terminal process
    ipcRenderer.invoke('terminal-kill', this.props.terminalId)
  }

  public render() {
    return (
      <div
        className="terminal-container"
        ref={this.containerRef}
        style={{
          width: '100%',
          height: '100%',
          display: this.props.isActive ? 'block' : 'none',
        }}
      />
    )
  }
}
