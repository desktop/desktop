import * as React from 'react'
import { ipcRenderer, shell, remote } from 'electron'
import { ICrashDetails, ErrorType } from './shared'
import { TitleBar } from '../ui/window/title-bar'
import { WindowState, getWindowState } from '../lib/window-state'
import { Octicon, OcticonSymbol } from '../ui/octicons'
import { Button } from '../ui/lib/button'

interface ICrashAppProps {
  readonly startTime: number
}

interface ICrashAppState {
  readonly type?: ErrorType
  readonly error?: Error
  readonly windowState: WindowState
}

const WelcomeLeftTopImageUri = `file:///${__dirname}/static/welcome-illustration-left-top.svg`
const WelcomeLeftBottomImageUri = `file:///${__dirname}/static/welcome-illustration-left-bottom.svg`

export class CrashApp extends React.Component<ICrashAppProps, ICrashAppState> {

  public constructor(props: ICrashAppProps) {
    super(props)

    this.state = {
      windowState: getWindowState(remote.getCurrentWindow()),
    }

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
    const message = this.state.type === 'launch'
      ? 'GitHub Desktop failed to launch'
      : 'GitHub Desktop encountered an error'

    return (
      <header>
        <Octicon symbol={OcticonSymbol.alert} className='error-icon' />
        <h1>{message}</h1>
      </header>
    )
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
        <TitleBar
          showAppIcon={true}
          titleBarStyle='dark'
          windowState={this.state.windowState}
        />
        <main>
          {this.renderTitle()}
          {this.renderDescription()}
          {this.renderErrorDetails()}
          
          <img className='welcome-graphic-top' src={WelcomeLeftTopImageUri} />
          <img className='welcome-graphic-bottom' src={WelcomeLeftBottomImageUri} />

          <div className='footer'>
            <Button type='submit'>Restart</Button>
          </div>
        </main>
      </div>
    )
  }
}
