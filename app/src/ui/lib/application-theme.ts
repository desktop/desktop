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
