import * as React from 'react'
import { ipcRenderer, shell, remote } from 'electron'
import { ICrashDetails, ErrorType } from './shared'
import { TitleBar } from '../ui/window/title-bar'
import { WindowState, getWindowState, windowStateChannelName } from '../lib/window-state'
import { Octicon, OcticonSymbol } from '../ui/octicons'
import { Button } from '../ui/lib/button'
import { getVersion } from '../ui/lib/app-proxy'
import { getOS } from '../lib/get-os'

interface ICrashAppProps {
  readonly startTime: number
}

interface ICrashAppState {
  readonly type?: ErrorType
  readonly error?: Error
  readonly windowState: WindowState
}

// Note that we're reusing the welcome illustrations here, any changes to these
// will have to be reflected in the welcome flow as well.
const BottomImageUri = `file:///${__dirname}/static/welcome-illustration-left-bottom.svg`

function prepareErrorMessage(error: Error) {

  let message

  if (error.stack) {
    message = error.stack
      .split('\n')
      .map((line) => {
        // The stack trace lines come in two forms:
        //
        // `at Function.module.exports.Emitter.simpleDispatch (SOME_USER_SPECIFIC_PATH/app/node_modules/event-kit/lib/emitter.js:25:14)`
        // `at file:///SOME_USER_SPECIFIC_PATH/app/renderer.js:6:4250`
        //
        // We want to try to strip the user-specific path part out.
        const match = line.match(/(\s*)(.*)(\(|file:\/\/\/).*(app.*)/)

        return !match || match.length < 5
          ? line
          : match[1] + match[2] + match[3] + match[4]
      })
      .join('\n')
  } else {
    message = `${error.name}: ${error.message}`
  }

  return `${message}\n\nVersion: ${getVersion()}\nOS: ${getOS()}\n`

}

export class CrashApp extends React.Component<ICrashAppProps, ICrashAppState> {

  public constructor(props: ICrashAppProps) {
    super(props)

    this.state = {
      windowState: getWindowState(remote.getCurrentWindow()),
    }
  }

  public componentDidMount() {
    const window = remote.getCurrentWindow()

    ipcRenderer.on(windowStateChannelName, (_, args) => {
      this.setState({ windowState: getWindowState(window) })
    })

    ipcRenderer.on('error', (event: Electron.IpcRendererEvent, crashDetails: ICrashDetails) => {
      this.setState(crashDetails)
    })

    const now = Date.now()
    ipcRenderer.send('crash-ready', now - this.props.startTime)
  }

  private onIssueTrackerLinkClicked = (e: React.MouseEvent<HTMLAnchorElement>) => {
    shell.openExternal('https://github.com/desktop/desktop/issues')
    e.preventDefault()
  }

  private onQuitButtonClicked = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    ipcRenderer.send('crash-quit')
  }

  private renderTitle() {
    const message = this.state.type === 'launch'
      ? 'GitHub Desktop failed to launch'
      : 'GitHub Desktop encountered an error'

    return (
      <header>
        <Octicon symbol={OcticonSymbol.stop} className='error-icon' />
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

    return <pre className='error'>{prepareErrorMessage(error)}</pre>
  }

  private renderQuitButton() {
    let quitText
    // We don't support restarting in dev mode since we can't
    // control the life time of the dev server.
    if (__DEV__) {
      quitText = __DARWIN__ ? 'Quit' : 'Exit'
    } else {
      quitText = __DARWIN__ ? 'Quit and Restart' : 'Exit and restart'
    }

    return (
      <Button
        type='submit'
        onClick={this.onQuitButtonClicked}
      >
        {quitText}
      </Button>
    )
  }

  public render() {

    return (
      <div id='crash-app'>
        <TitleBar
          showAppIcon={__WIN32__}
          titleBarStyle='dark'
          windowState={this.state.windowState}
        />
        <main>
          {this.renderTitle()}
          {this.renderDescription()}
          {this.renderErrorDetails()}

          <img className='background-graphic-bottom' src={BottomImageUri} />

          <div className='footer'>
            {this.renderQuitButton()}
          </div>
        </main>
      </div>
    )
  }
}
