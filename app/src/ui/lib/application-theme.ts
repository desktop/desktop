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

export type ApplicableTheme = ApplicationTheme.Light | ApplicationTheme.Dark

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
 * Load the name of the currently selected theme
 */
export function getCurrentlyAppliedTheme(): ApplicableTheme {
  return isDarkModeEnabled() ? ApplicationTheme.Dark : ApplicationTheme.Light
}

/**
 * Stores the given theme in the persistent store.
 *
 * @returns If currently set to ApplicationTheme.System
 */
export function setPersistedTheme(theme: ApplicationTheme): void {
  remote.nativeTheme.themeSource = getThemeName(theme)
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

function isDarkModeEnabled(): boolean {
  return remote.nativeTheme.shouldUseDarkColors
}
