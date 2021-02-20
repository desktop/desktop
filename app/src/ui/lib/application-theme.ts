import { remote } from 'electron'
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
 * Store the given theme in the persistent store.
 */
export function setPersistedTheme(theme: ApplicationTheme) {
  remote.nativeTheme.themeSource = getThemeName(theme)
}
