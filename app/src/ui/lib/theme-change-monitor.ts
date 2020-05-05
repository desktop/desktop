import { remote } from 'electron'
import { ApplicationTheme } from './application-theme'
import { IDisposable, Disposable, Emitter } from 'event-kit'
import { supportsDarkMode, isDarkModeEnabled } from './dark-theme'

class ThemeChangeMonitor implements IDisposable {
  private readonly emitter = new Emitter()

  public constructor() {
    this.subscribe()
  }

  public dispose() {
    remote.nativeTheme.removeAllListeners()
  }

  private subscribe = () => {
    if (!supportsDarkMode()) {
      return
    }

    remote.nativeTheme.addListener('updated', this.onThemeNotificationFromOS)
  }

  private onThemeNotificationFromOS = (event: string, userInfo: any) => {
    const darkModeEnabled = isDarkModeEnabled()

    const theme = darkModeEnabled
      ? ApplicationTheme.Dark
      : ApplicationTheme.Light
    this.emitThemeChanged(theme)
  }

  public onThemeChanged(fn: (theme: ApplicationTheme) => void): Disposable {
    return this.emitter.on('theme-changed', fn)
  }

  private emitThemeChanged(theme: ApplicationTheme) {
    this.emitter.emit('theme-changed', theme)
  }
}

// this becomes our singleton that we can subscribe to from anywhere
export const themeChangeMonitor = new ThemeChangeMonitor()

// this ensures we cleanup any existing subscription on exit
remote.app.on('will-quit', () => {
  themeChangeMonitor.dispose()
})
