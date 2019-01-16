import * as React from 'react'

import { remote } from 'electron'
import { WindowState } from '../../lib/window-state'
import { WindowControls } from './window-controls'
import Octicon, * as OcticonSymbol from '@githubprimer/octicons-react'

interface ITitleBarProps {
  /**
   * The current state of the Window, ie maximized, minimized full-screen etc.
   */
  readonly windowState: WindowState

  /** Whether we should hide the toolbar (and show inverted window controls) */
  readonly titleBarStyle: 'light' | 'dark'

  /** Whether or not to render the app icon */
  readonly showAppIcon: boolean

  /**
   * The current zoom factor of the Window represented as a fractional number
   * where 1 equals 100% (ie actual size) and 2 represents 200%.
   *
   * This is used on macOS to scale back the title bar to its original size
   * regardless of the zoom factor.
   */
  readonly windowZoomFactor?: number
}

interface ITitleBarState {
  readonly style?: React.CSSProperties
}

function getState(props: ITitleBarProps): ITitleBarState {
  // See windowZoomFactor in ITitleBarProps, this is only
  // applicable on macOS.
  if (!__DARWIN__) {
    return { style: undefined }
  }

  return {
    style: props.windowZoomFactor
      ? { zoom: 1 / props.windowZoomFactor }
      : undefined,
  }
}

export class TitleBar extends React.Component<ITitleBarProps, ITitleBarState> {
  public constructor(props: ITitleBarProps) {
    super(props)
    this.state = getState(props)
  }

  private onTitlebarDoubleClickDarwin = () => {
    const actionOnDoubleClick = remote.systemPreferences.getUserDefault(
      'AppleActionOnDoubleClick',
      'string'
    )
    const mainWindow = remote.getCurrentWindow()

    switch (actionOnDoubleClick) {
      case 'Maximize':
        if (mainWindow.isMaximized()) {
          mainWindow.unmaximize()
        } else {
          mainWindow.maximize()
        }
        break
      case 'Minimize':
        mainWindow.minimize()
        break
    }
  }

  public componentWillReceiveProps(nextProps: ITitleBarProps) {
    if (__DARWIN__) {
      if (this.props.windowZoomFactor !== nextProps.windowZoomFactor) {
        this.setState(getState(nextProps))
      }
    }
  }

  public render() {
    const inFullScreen = this.props.windowState === 'full-screen'
    const isMaximized = this.props.windowState === 'maximized'

    // No Windows controls when we're in full-screen mode.
    const winControls = __WIN32__ && !inFullScreen ? <WindowControls /> : null

    // On Windows it's not possible to resize a frameless window if the
    // element that sits flush along the window edge has -webkit-app-region: drag.
    // The menu bar buttons all have no-drag but the area between menu buttons and
    // window controls need to disable dragging so we add a 3px tall element which
    // disables drag while still letting users drag the app by the titlebar below
    // those 3px.
    const topResizeHandle =
      __WIN32__ && !isMaximized ? <div className="resize-handle top" /> : null

    // And a 3px wide element on the left hand side.
    const leftResizeHandle =
      __WIN32__ && !isMaximized ? <div className="resize-handle left" /> : null

    const titleBarClass =
      this.props.titleBarStyle === 'light' ? 'light-title-bar' : ''

    const appIcon = this.props.showAppIcon ? (
      <Octicon className="app-icon" icon={OcticonSymbol.MarkGithub} />
    ) : null

    const onTitlebarDoubleClick = __DARWIN__
      ? this.onTitlebarDoubleClickDarwin
      : undefined

    return (
      <div
        className={titleBarClass}
        id="desktop-app-title-bar"
        onDoubleClick={onTitlebarDoubleClick}
        style={this.state.style}
      >
        {topResizeHandle}
        {leftResizeHandle}
        {appIcon}
        {this.props.children}
        {winControls}
      </div>
    )
  }
}
