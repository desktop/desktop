import * as React from 'react'
import { ipcRenderer, remote } from 'electron'
import {
  WindowState,
  getWindowState,
  windowStateChannelName,
} from '../../lib/window-state'
import classNames from 'classnames'

// These paths are all drawn to a 10x10 view box and replicate the symbols
// seen on Windows 10 window controls.
const closePath =
  'M 0,0 0,0.7 4.3,5 0,9.3 0,10 0.7,10 5,5.7 9.3,10 10,10 10,9.3 5.7,5 10,0.7 10,0 9.3,0 5,4.3 0.7,0 Z'
const restorePath =
  'm 2,1e-5 0,2 -2,0 0,8 8,0 0,-2 2,0 0,-8 z m 1,1 6,0 0,6 -1,0 0,-5 -5,0 z m -2,2 6,0 0,6 -6,0 z'
const maximizePath = 'M 0,0 0,10 10,10 10,0 Z M 1,1 9,1 9,9 1,9 Z'
const minimizePath = 'M 0,5 10,5 10,6 0,6 Z'

interface IWindowControlState {
  readonly windowState: WindowState
}

/**
 * A component replicating typical win32 window controls in frameless windows
 *
 * Note that the component only supports the Windows platform at the moment
 * and will render nothing when used on other platforms.
 *
 * Uses the electron remote module to perform window state actions on the
 * current window. Relies on the custom ipc channel 'window-state-changed' to
 * be configured in the main process. The channel should emit an event at least
 * every time there's a change in the window state but _may_ send duplicate
 * or out-of-bound events communicating the _current_ state as well.
 */
export class WindowControls extends React.Component<{}, IWindowControlState> {
  public componentWillMount() {
    this.setState({ windowState: getWindowState(remote.getCurrentWindow()) })

    ipcRenderer.on(windowStateChannelName, this.onWindowStateChanged)
  }

  public componentWillUnmount() {
    ipcRenderer.removeListener(
      windowStateChannelName,
      this.onWindowStateChanged
    )
  }

  public shouldComponentUpdate(nextProps: {}, nextState: IWindowControlState) {
    return nextState.windowState !== this.state.windowState
  }

  private onWindowStateChanged = (
    event: Electron.IpcRendererEvent,
    windowState: WindowState
  ) => {
    this.setState({ windowState })
  }

  private onMinimize = () => {
    remote.getCurrentWindow().minimize()
  }

  private onMaximize = () => {
    remote.getCurrentWindow().maximize()
  }

  private onRestore = () => {
    remote.getCurrentWindow().unmaximize()
  }

  private onClose = () => {
    remote.getCurrentWindow().close()
  }

  private renderButton(
    name: string,
    onClick: React.EventHandler<React.MouseEvent<any>>,
    path: string
  ) {
    const className = classNames('window-control', name)
    const title = name[0].toUpperCase() + name.substring(1)

    return (
      <button
        aria-label={name}
        title={title}
        tabIndex={-1}
        className={className}
        onClick={onClick}
      >
        <svg aria-hidden="true" version="1.1" width="10" height="10">
          <path d={path} />
        </svg>
      </button>
    )
  }

  public render() {
    // We only know how to render fake Windows-y controls
    if (!__WIN32__) {
      return <span />
    }

    const min = this.renderButton('minimize', this.onMinimize, minimizePath)
    const maximizeOrRestore =
      this.state.windowState === 'maximized'
        ? this.renderButton('restore', this.onRestore, restorePath)
        : this.renderButton('maximize', this.onMaximize, maximizePath)
    const close = this.renderButton('close', this.onClose, closePath)

    return (
      <div className="window-controls">
        {min}
        {maximizeOrRestore}
        {close}
      </div>
    )
  }
}
