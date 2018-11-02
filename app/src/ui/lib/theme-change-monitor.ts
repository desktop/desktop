import { remote } from 'electron'
import { ApplicationTheme } from './application-theme'
import { IDisposable, Disposable, Emitter } from 'event-kit'
import { supportsDarkMode, isDarkModeEnabled } from './dark-theme'

class ThemeChangeMonitor implements IDisposable {
  private readonly emitter = new Emitter()

  private subscriptionID: number | null = null

  constructor() {
    this.subscribe()
  }

  dispose() {
    this.unsubscribe()
  }

  private subscribe = () => {
    if (!supportsDarkMode()) {
      return
    }

    this.subscriptionID = remote.systemPreferences.subscribeNotification(
      'AppleInterfaceThemeChangedNotification',
      this.onThemeNotificationFromOS
    )
  }

  private onThemeNotificationFromOS = (event: string, userInfo: any) => {
    // if there is details in the payload from the OS about the theme change we should
    // use that rather than query again for the dark theme state
    const darkModeEnabled = isDarkModeEnabled()

    const theme = darkModeEnabled
      ? ApplicationTheme.Dark
      : ApplicationTheme.Light
    this.emitThemeChanged(theme)

    // do we need to re-subscribe to the event after it was raised? if not, these
    // lines are unnecessary and can be removed
    this.unsubscribe()
    this.subscribe()
  }

  private unsubscribe = () => {
    if (this.subscriptionID !== null) {
      remote.systemPreferences.unsubscribeNotification(this.subscriptionID)
    }
  }

  // subscribers call this function and pass in the callback they want to run
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
