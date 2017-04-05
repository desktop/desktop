// The name of the ipc channel over which state changes are communicated.
export const windowStateChannelName = 'window-state-changed'

export type WindowState = 'minimized' | 'normal' | 'maximized' | 'full-screen' | 'hidden'

export function getWindowState(window: Electron.BrowserWindow): WindowState {
  if (window.isFullScreen()) {
    return 'full-screen'
  } else if (window.isMaximized()) {
    return 'maximized'
  } else if (window.isMinimized()) {
    return 'minimized'
  } else if (!window.isVisible()) {
    return 'hidden'
  } else {
    return 'normal'
  }
}
