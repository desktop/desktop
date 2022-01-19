import * as remote from '@electron/remote'
import {
  ApplicableTheme,
  getCurrentlyAppliedTheme,
  supportsSystemThemeChanges,
} from './application-theme'
import { Disposable, Emitter } from 'event-kit'

class ThemeChangeMonitor {
  private readonly emitter = new Emitter()

  public constructor() {
    this.subscribe()
  }

  private subscribe = () => {
    if (!supportsSystemThemeChanges()) {
      return
    }

    remote.nativeTheme.addListener('updated', this.onThemeNotificationUpdated)
  }

  private onThemeNotificationUpdated = (event: string, userInfo: any) => {
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
