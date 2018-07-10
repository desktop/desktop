import { assertNever } from '../../lib/fatal-error'

/**
 * A set of the user-selectable appearances (aka themes)
 */
export enum ApplicationTheme {
  Light,
  Dark,
}

/**
 * Gets the friendly name of an application theme for use
 * in persisting to storage and/or calculating the required
 * body class name to set in order to apply the theme.
 */
export function getThemeName(theme: ApplicationTheme): string {
  switch (theme) {
    case ApplicationTheme.Light:
      return 'light'
    case ApplicationTheme.Dark:
      return 'dark'
    default:
      return assertNever(theme, `Unknown theme ${theme}`)
  }
}

// The key under which the currently selected theme is persisted
// in localStorage.
const applicationThemeKey = 'theme'

/**
 * Load the currently selected theme from the persistent
 * store (localStorage). If no theme is selected the default
 * theme will be returned.
 */
export function getPersistedTheme(): ApplicationTheme {
  return localStorage.getItem(applicationThemeKey) === 'dark'
    ? ApplicationTheme.Dark
    : ApplicationTheme.Light
}

/**
 * Load the name of the currently selected theme from the persistent
 * store (localStorage). If no theme is selected the default
 * theme name will be returned.
 */
export function getPersistedThemeName(): string {
  return getThemeName(getPersistedTheme())
}

/**
 * Store the given theme in the persistent store (localStorage).
 */
export function setPersistedTheme(theme: ApplicationTheme) {
  localStorage.setItem(applicationThemeKey, getThemeName(theme))
}
