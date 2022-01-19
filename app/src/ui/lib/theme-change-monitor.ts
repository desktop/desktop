import {
  ApplicableTheme,
  getCurrentlyAppliedTheme,
  supportsSystemThemeChanges,
} from './application-theme'
import { Disposable, Emitter } from 'event-kit'
import { ipcRenderer } from 'electron'

class ThemeChangeMonitor {
  private readonly emitter = new Emitter()

  public constructor() {
    this.subscribe()
  }

  private subscribe = () => {
    if (!supportsSystemThemeChanges()) {
      return
    }

    ipcRenderer.on('native-theme-updated', this.onThemeNotificationUpdated)

    ipcRenderer.invoke('subscribe-native-theme-updated')
  }

  private onThemeNotificationUpdated = () => {
    const theme = getCurrentlyAppliedTheme()
    this.emitThemeChanged(theme)
  }

  public onThemeChanged(fn: (theme: ApplicableTheme) => void): Disposable {
    return this.emitter.on('theme-changed', fn)
  }

  private emitThemeChanged(theme: ApplicableTheme) {
    this.emitter.emit('theme-changed', theme)
  }
}

// this becomes our singleton that we can subscribe to from anywhere
export const themeChangeMonitor = new ThemeChangeMonitor()
