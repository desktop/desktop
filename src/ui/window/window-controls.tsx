import * as React from 'react'
import {ipcRenderer, remote} from 'electron'
import {WindowState, getWindowState} from '../../lib/window-state'

const windowStateChannelName = 'window-state-changed'

interface WindowControlState {
  windowState: WindowState
}

export class WindowControls extends React.Component<void, WindowControlState> {

  public componentWillMount() {
    this.setState({ windowState: getWindowState(remote.getCurrentWindow()) })

    ipcRenderer.on(windowStateChannelName, this.onWindowStateChanged)
  }

  public componentWillUnmount() {
    ipcRenderer.removeListener(windowStateChannelName, this.onWindowStateChanged)
  }

  private onWindowStateChanged = (event: Electron.IpcRendererEvent, args: any) => {
    this.setState({ windowState: args as WindowState })
  }

  private renderButton(name: string, onClick: React.EventHandler<React.MouseEvent>) {
    const className = `window-control ${name}`
    return (
      <button tabIndex='-1' className={className} onClick={onClick}>
        {name}
      </button>)
  }

  private onMinimize() {
    remote.getCurrentWindow().minimize()
  }

  private onMaximize() {
    remote.getCurrentWindow().maximize()
  }

  private onRestore() {
    remote.getCurrentWindow().unmaximize()
  }

  private onClose() {
    remote.getCurrentWindow().close()
  }

  public render() {

    // We only know how to render fake windows-y controls
    if (process.platform !== 'win32') {
      return null
    }

    const min = this.renderButton('minimize', this.onMinimize)
    const maximizeOrRestore = this.state.windowState === 'maximized'
      ? this.renderButton('restore', this.onRestore)
      : this.renderButton('maximize', this.onMaximize)
    const close = this.renderButton('close', this.onClose)

    return (
      <div className='window-controls'>
        {min}
        {maximizeOrRestore}
        {close}
      </div>
    )
  }
}
