import * as React from 'react'
import { ipcRenderer, remote } from 'electron'
import { ICrashDetails, ErrorType } from './shared'
import { TitleBar } from '../ui/window/title-bar'
import { encodePathAsUrl } from '../lib/path'
import {
  WindowState,
  getWindowState,
  windowStateChannelName,
} from '../lib/window-state'
import { Octicon, OcticonSymbol } from '../ui/octicons'
import { Button } from '../ui/lib/button'
import { LinkButton } from '../ui/lib/link-button'
import { getVersion } from '../ui/lib/app-proxy'
import { getOS } from '../lib/get-os'

interface ICrashAppProps {}

interface ICrashAppState {
  /**
   * Whether this error was thrown before we were able to launch
   * the main renderer process or not. See the documentation for
   * the ErrorType type for more details.
   */
  readonly type?: ErrorType

  /**
   * The error that caused us to spawn the crash process.
   */
  readonly error?: Error

  /**
   * The current state of the Window, ie maximized, minimized full-screen etc.
   */
  readonly windowState: WindowState
}

// Note that we're reusing the welcome illustration here, any changes to it
// will have to be reflected in the welcome flow as well.
const BottomImageUri = encodePathAsUrl(
  __dirname,
  'static/welcome-illustration-left-bottom.svg'
)

const issuesUri = 'https://github.com/desktop/desktop/issues'

/**
 * Formats an error by attempting to strip out user-identifiable information
 * from paths and appends system metadata such and the running version and
 * current operating system.
 */
function prepareErrorMessage(error: Error) {
  let message

  if (error.stack) {
    message = error.stack
      .split('\n')
      .map(line => {
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

/**
 * The root component for our crash process.
 *
 * The crash process is responsible for presenting the user with an
 * error after the main process or any renderer process has crashed due
 * to an uncaught exception or when the main renderer has failed to load.
 *
 * Exercise caution when working with the crash process. If the crash
 * process itself crashes we've failed.
 */
export class CrashApp extends React.Component<ICrashAppProps, ICrashAppState> {
  public constructor(props: ICrashAppProps) {
    super(props)

    this.state = {
      windowState: getWindowState(remote.getCurrentWindow()),
    }
  }

  public componentDidMount() {
    const window = remote.getCurrentWindow()

    ipcRenderer.on(windowStateChannelName, () => {
      this.setState({ windowState: getWindowState(window) })
    })

    ipcRenderer.on(
      'error',
      (event: Electron.IpcMessageEvent, crashDetails: ICrashDetails) => {
        this.setState(crashDetails)
      }
    )

    ipcRenderer.send('crash-ready')
  }

  private onQuitButtonClicked = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    ipcRenderer.send('crash-quit')
  }

  private renderTitle() {
    const message =
      this.state.type === 'launch'
        ? 'GitHub Desktop failed to launch'
        : 'GitHub Desktop encountered an error'

    return (
      <header>
        <Octicon symbol={OcticonSymbol.stop} className="error-icon" />
        <h1>{message}</h1>
      </header>
    )
  }

  private renderDescription() {
    if (this.state.type === 'launch') {
      return (
        <p>
          GitHub Desktop encountered a catastrophic error that prevents it from
          launching. This has been reported to the team, but if you encounter
          this repeatedly please report this issue to the GitHub Desktop{" "}
          <LinkButton uri={issuesUri}>issue tracker</LinkButton>.
        </p>
      )
    } else {
      return (
        <p>
          GitHub Desktop has encountered an unrecoverable error and will need to
          restart. This has been reported to the team, but if you encounter this
          repeatedly please report this issue to the GitHub Desktop{" "}
          <LinkButton uri={issuesUri}>issue tracker</LinkButton>.
        </p>
      )
    }
  }

  private renderErrorDetails() {
    const error = this.state.error

    if (!error) {
      return
    }

    return <pre className="error">{prepareErrorMessage(error)}</pre>
  }

  private renderFooter() {
    return <div className="footer">{this.renderQuitButton()}</div>
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
      <Button type="submit" onClick={this.onQuitButtonClicked}>
        {quitText}
      </Button>
    )
  }

  private renderBackgroundGraphics() {
    return <img className="background-graphic-bottom" src={BottomImageUri} />
  }

  public render() {
    return (
      <div id="crash-app">
        <TitleBar
          showAppIcon={false}
          titleBarStyle="light"
          windowState={this.state.windowState}
        />
        <main>
          {this.renderTitle()}
          {this.renderDescription()}
          {this.renderErrorDetails()}
          {this.renderFooter()}
          {this.renderBackgroundGraphics()}
        </main>
      </div>
    )
  }
}
