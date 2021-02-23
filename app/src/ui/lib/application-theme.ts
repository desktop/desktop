import { remote } from 'electron'
import {
  isMacOSMojaveOrLater,
  isWindows10And1809Preview17666OrLater,
} from '../../lib/get-os'

/**
 * A set of the user-selectable appearances (aka themes)
 */
export enum ApplicationTheme {
  Light,
  Dark,
  System,
}

/**
 * Gets the friendly name of an application theme for use
 * in persisting to storage and/or calculating the required
 * body class name to set in order to apply the theme.
 */
export function getThemeName(
  theme: ApplicationTheme
): 'light' | 'dark' | 'system' {
  switch (theme) {
    case ApplicationTheme.Light:
      return 'light'
    case ApplicationTheme.Dark:
      return 'dark'
    default:
      return 'system'
  }
}

/**
 * Load the currently selected theme
 */
export function getPersistedTheme(): ApplicationTheme {
  const currentTheme = remote.nativeTheme.themeSource

  switch (currentTheme) {
    case 'light':
      return ApplicationTheme.Light
    case 'dark':
      return ApplicationTheme.Dark
    default:
      return ApplicationTheme.System
  }
}

/**
 * Load the name of the currently selected theme
 */
export function getPersistedThemeName(): string {
  return remote.nativeTheme.themeSource
}

/**
 * Stores the given theme in the persistent store.
 *
 * @returns If currently set to ApplicationTheme.System
 */
export function setPersistedTheme(theme: ApplicationTheme): boolean {
  remote.nativeTheme.themeSource = getThemeName(theme)

  return theme === ApplicationTheme.System
}

/**
 * Whether or not the current OS supports System Theme Changes
 */
export function supportsSystemThemeChanges(): boolean {
  if (__DARWIN__) {
    return isMacOSMojaveOrLater()
  } else if (__WIN32__) {
    // Its technically possible this would still work on prior versions of Windows 10 but 1809
    // was released October 2nd, 2018 that the feature can just be "attained" by upgrading
    // See https://github.com/desktop/desktop/issues/9015 for more
    return isWindows10And1809Preview17666OrLater()
  }

  return false
}

export function isDarkModeEnabled(): boolean {
  if (!supportsSystemThemeChanges()) {
    return false
  }

  // remote is an IPC call, so if we know there's no point making this call
  // we should avoid paying the IPC tax
  return remote.nativeTheme.shouldUseDarkColors
}
