import {
  isMacOSMojaveOrLater,
  isWindows10And1809Preview17666OrLater,
} from '../../lib/get-os'
import { getBoolean } from '../../lib/local-storage'
import {
  setNativeThemeSource,
  shouldUseDarkColors,
} from '../main-process-proxy'
import { ThemeSource } from './theme-source'

/** Interface for set of customizable styles */
export interface ICustomTheme {
  // application background color
  background: string
  // application border color
  border: string
  // main application text color
  text: string
  // used to indicate a selected item or action button
  activeItem: string
  // text used on selected item or action button
  activeText: string
}

/**
 * A set of the user-selectable appearances (aka themes)
 */
export enum ApplicationTheme {
  Light = 'light',
  Dark = 'dark',
  System = 'system',
  HighContrast = 'highContrast',
}

export type ApplicableTheme =
  | ApplicationTheme.Light
  | ApplicationTheme.Dark
  | ApplicationTheme.HighContrast

/**
 * Gets the friendly name of an application theme for use
 * in persisting to storage and/or calculating the required
 * body class name to set in order to apply the theme.
 */
export function getThemeName(theme: ApplicationTheme): ThemeSource {
  switch (theme) {
    case ApplicationTheme.Light:
      return 'light'
    case ApplicationTheme.Dark:
    case ApplicationTheme.HighContrast:
      return 'dark'
    default:
      return 'system'
  }
}

// The key under which the decision to automatically switch the theme is persisted
// in localStorage.
const automaticallySwitchApplicationThemeKey = 'autoSwitchTheme'

/**
 * Function to preserve and convert legacy theme settings
 * should be removable after most users have upgraded to 2.7.0+
 */
function migrateAutomaticallySwitchSetting(): string | null {
  const automaticallySwitchApplicationTheme = getBoolean(
    automaticallySwitchApplicationThemeKey,
    false
  )

  localStorage.removeItem(automaticallySwitchApplicationThemeKey)

  if (automaticallySwitchApplicationTheme) {
    setPersistedTheme(ApplicationTheme.System)
    return 'system'
  }

  return null
}

// The key under which the currently selected theme is persisted
// in localStorage.
const applicationThemeKey = 'theme'

/**
 * Returns User's theme preference or 'system' if not set or parsable
 */
function getApplicationThemeSetting(): ApplicationTheme {
  const themeSetting = localStorage.getItem(applicationThemeKey)

  if (
    themeSetting === ApplicationTheme.Light ||
    themeSetting === ApplicationTheme.Dark ||
    themeSetting === ApplicationTheme.HighContrast
  ) {
    return themeSetting
  }

  return ApplicationTheme.System
}

/**
 * Load the name of the currently selected theme
 */
export async function getCurrentlyAppliedTheme(): Promise<ApplicableTheme> {
  return (await isDarkModeEnabled())
    ? ApplicationTheme.Dark
    : ApplicationTheme.Light
}

/**
 * Load the name of the currently selected theme
 */
export function getPersistedThemeName(): ApplicationTheme {
  if (migrateAutomaticallySwitchSetting() === 'system') {
    return ApplicationTheme.System
  }

  return getApplicationThemeSetting()
}

/**
 * Stores the given theme in the persistent store.
 */
export function setPersistedTheme(theme: ApplicationTheme): void {
  const themeName = getThemeName(theme)
  localStorage.setItem(applicationThemeKey, theme)
  setNativeThemeSource(themeName)
}

/**
 * Whether or not the current OS supports System Theme Changes
 */
export function supportsSystemThemeChanges(): boolean {
  if (__DARWIN__) {
    return isMacOSMojaveOrLater()
  } else if (__WIN32__) {
    // Its technically possible this would still work on prior versions of Windows 10 but 1809
    // was released October 2nd, 2018 and the feature can just be "attained" by upgrading
    // See https://github.com/desktop/desktop/issues/9015 for more
    return isWindows10And1809Preview17666OrLater()
  }

  return false
}

function isDarkModeEnabled(): Promise<boolean> {
  return shouldUseDarkColors()
}
