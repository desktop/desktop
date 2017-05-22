import * as React from 'react'
import { ipcRenderer, shell } from 'electron'
import { ICrashDetails, ErrorType } from './shared'

interface ICrashAppProps {
  readonly startTime: number
}

interface ICrashAppState {
  readonly type?: ErrorType
  readonly error?: Error
}

export class CrashApp extends React.Component<ICrashAppProps, ICrashAppState> {

  public constructor(props: ICrashAppProps) {
    super(props)

    this.state = { }

    ipcRenderer.on('error', (event: Electron.IpcRendererEvent, crashDetails: ICrashDetails) => {
      this.setState(crashDetails)
    })
  }

  public componentDidMount() {
    const now = Date.now()
    ipcRenderer.send('crash-ready', now - this.props.startTime)
  }

  private onIssueTrackerLinkClicked = (e: React.MouseEvent<HTMLAnchorElement>) => {
    shell.openExternal('https://github.com/desktop/desktop/issues')
    e.preventDefault()
  }

  private renderTitle() {
    if (this.state.type === 'launch') {
      return <h1>GitHub Desktop failed to launch</h1>
    } else {
      return <h1>GitHub Desktop has encountered an unexpected error and needs to restart</h1>
    }
  }

  private renderDescription() {
    if (this.state.type === 'launch') {
      return (
        <p>
          GitHub Desktop encountered a catastrophic error that prevents it from
          launching. This has been reported to the team, but if you encounter this
          repeatedly please report this issue to the
          GitHub Desktop <a href='https://github.com/desktop/desktop/issues' onClick={this.onIssueTrackerLinkClicked}>issue tracker</a>.
        </p>
      )
    } else {
      return (
        <p>
          GitHub Desktop has encountered an unrecoverable error and will need to restart.
          This has been reported to the team, but if you encounter this repeatedly please
          report this issue to the GitHub Desktop <a href='https://github.com/desktop/desktop/issues' onClick={this.onIssueTrackerLinkClicked}>issue tracker</a>.
        </p>
      )
    }
  }

  private renderErrorDetails() {
    const error = this.state.error

    if (!error) {
      return
    }

    if (!error.stack) {
      return <pre className='error'>{error.name}: ${error.message}</pre>
    } else {
      return <pre className='error'>{error.stack}</pre>
    }
  }

  public render() {
    return (
      <div id='crash-app'>
        {this.renderTitle()}
        {this.renderDescription()}
        {this.renderErrorDetails()}
      </div>
    )
  }
}
