import { remote } from 'electron'
import {
  ApplicationTheme,
  supportsSystemThemeChanges,
  getCurrentlyAppliedTheme,
} from './application-theme'
import { IDisposable, Disposable, Emitter } from 'event-kit'

class ThemeChangeMonitor implements IDisposable {
  private readonly emitter = new Emitter()

  public constructor() {
    this.subscribe()
  }

  public dispose() {
    remote.nativeTheme.removeAllListeners()
  }

  private subscribe = () => {
    if (!supportsSystemThemeChanges()) {
      return
    }

    remote.nativeTheme.addListener('updated', this.onThemeNotificationUpdated)
  }

  private onThemeNotificationUpdated = (event: string, userInfo: any) => {
    const theme = getCurrentlyAppliedTheme()
      ? ApplicationTheme.Dark
      : ApplicationTheme.Light

    this.emitThemeChanged(theme)
  }

  public onThemeChanged(
    fn: (theme: ApplicationTheme.Light | ApplicationTheme.Dark) => void
  ): Disposable {
    return this.emitter.on('theme-changed', fn)
  }

  private emitThemeChanged(
    theme: ApplicationTheme.Light | ApplicationTheme.Dark
  ) {
    this.emitter.emit('theme-changed', theme)
  }
}

// this becomes our singleton that we can subscribe to from anywhere
export const themeChangeMonitor = new ThemeChangeMonitor()

// this ensures we cleanup any existing subscription on exit
remote.app.on('will-quit', () => {
  themeChangeMonitor.dispose()
})
