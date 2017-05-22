import * as React from 'react'
import { ipcRenderer } from 'electron'

interface ICrashAppProps {
  readonly startTime: number
}

interface ICrashAppState {
  readonly error?: Error
}

export class CrashApp extends React.Component<ICrashAppProps, ICrashAppState> {

  public constructor(props: ICrashAppProps) {
    super(props)

    this.state = { }
    console.info('ctor')

    ipcRenderer.on('error', (event: Electron.IpcRendererEvent, error: Error) => {
      this.setState({ error })
    })
  }

  public componentDidMount() {
    console.info('mounted')
    const now = Date.now()
    ipcRenderer.send('crash-ready', now - this.props.startTime)
  }

  public render() {
    return <div id='crash-app'>hello world {this.state.error ? this.state.error.stack : undefined}</div>
  }
}
