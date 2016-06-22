export type WindowState = 'minimized' | 'normal' | 'maximized' | 'full-screen'

export function getWindowState(window: Electron.BrowserWindow): WindowState {
  if (window.isFullScreen()) {
    return 'full-screen'
  } else if (window.isMaximized()) {
    return 'maximized'
  } else if (window.isMinimized()) {
    return 'minimized'
  } else {
    return 'normal'
  }
}
