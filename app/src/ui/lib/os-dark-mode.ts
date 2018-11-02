import { remote } from 'electron'
import {
  getAutoSwitchPersistedTheme,
  // ApplicationTheme,
} from './application-theme'

export function useOSDarkMode() {
  subscribeToThemeChangedNotification()
  return updateThemeBasedOnSystem()
}

function updateThemeBasedOnSystem() {
  const useDarkMode = remote.systemPreferences.isDarkMode()
  const automaticallySwitchTheme = getAutoSwitchPersistedTheme()

  if (automaticallySwitchTheme) {
    // const theme = useDarkMode ? ApplicationTheme.Dark : ApplicationTheme.Light
    // Fire theme to dispatcher somehow :/
    subscribeToThemeChangedNotification()
  }

  return useDarkMode
}

function subscribeToThemeChangedNotification() {
  const subscriptionID = remote.systemPreferences.subscribeNotification(
    'AppleInterfaceThemeChangedNotification',
    updateThemeBasedOnSystem
  )

  remote.app.on('will-quit', () => {
    remote.systemPreferences.unsubscribeNotification(subscriptionID)
  })
}
