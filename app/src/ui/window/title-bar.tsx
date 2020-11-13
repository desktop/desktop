import * as React from 'react'
import memoizeOne from 'memoize-one'
import { remote } from 'electron'
import { WindowState } from '../../lib/window-state'
import { WindowControls } from './window-controls'
import { Octicon, OcticonSymbol } from '../octicons'
import { isMacOSBigSurOrLater } from '../../lib/get-os'

/** Get the height (in pixels) of the title bar depending on the platform */
export function getTitleBarHeight() {
  if (__DARWIN__) {
    // Big Sur has taller title bars, see #10980
    return isMacOSBigSurOrLater() ? 26 : 22
  }

  return 28
}

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

export class TitleBar extends React.Component<ITitleBarProps> {
  private getStyle = memoizeOne((windowZoomFactor: number | undefined) => {
    const style: React.CSSProperties = { height: getTitleBarHeight() }

    // See windowZoomFactor in ITitleBarProps, this is only applicable on macOS.
    if (__DARWIN__ && windowZoomFactor !== undefined) {
      style.zoom = 1 / windowZoomFactor
    }

    return style
  })

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
      <Octicon className="app-icon" symbol={OcticonSymbol.markGithub} />
    ) : null

    const onTitlebarDoubleClick = __DARWIN__
      ? this.onTitlebarDoubleClickDarwin
      : undefined

    return (
      <div
        className={titleBarClass}
        id="desktop-app-title-bar"
        onDoubleClick={onTitlebarDoubleClick}
        style={this.getStyle(this.props.windowZoomFactor)}
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
