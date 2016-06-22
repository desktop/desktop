import * as React from 'react'
import {remote} from 'electron'

interface WindowControlState {
  windowState: 'minimized' | 'normal' | 'maximized' | 'full-screen'
}

export class WindowControls extends React.Component<void, WindowControlState> {

  public componentWillMount() {
    this.setState({ windowState: 'normal' })
  }

  public render() {

    // We only know how to render fake windows-y controls
    if (process.platform !== 'win32') {
      return null
    }

    const min = <button tabIndex='-1' className='window-control minimize' onClick={() => remote.getCurrentWindow().minimize()}>min</button>

    const maximizeOrRestore = this.state.windowState === 'maximized'
      ? <button tabIndex='-1' className='window-control restore' onClick={() => remote.getCurrentWindow().unmaximize()}>restore</button>
      : <button tabIndex='-1' className='window-control maximize' onClick={() => remote.getCurrentWindow().maximize()}>max</button>

    const close = <button tabIndex='-1' className='window-control close' onClick={() => remote.getCurrentWindow().close()}>x</button>

    return (
      <div className='window-controls'>
        {min}
        {maximizeOrRestore}
        {close}
      </div>
    )
  }
}
