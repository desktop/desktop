import { remote } from 'electron'
import {
  isMacOSMojaveOrLater,
  isWindows10And1809Preview17666OrLater,
} from '../../lib/get-os'
import { getBoolean } from '../../lib/local-storage'

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
  const currentTheme = getPersistedThemeName()

  switch (currentTheme) {
    case 'light':
      return ApplicationTheme.Light
    case 'dark':
      return ApplicationTheme.Dark
    default:
      return ApplicationTheme.System
  }
}

// The key under which the currently selected theme is persisted
// in localStorage.
const applicationThemeKey = 'theme'

// The key under which the decision to automatically switch the theme is persisted
// in localStorage.
const automaticallySwitchApplicationThemeKey = 'autoSwitchTheme'

/**
 * Function to preserve and convert legacy theme settings
 * should be removable after most users have upgraded to 2.7.0+
 */
function checkLegacyThemeSetting(): string | null {
  const automaticallySwitchApplicationTheme = getBoolean(
    automaticallySwitchApplicationThemeKey,
    false
  )

  localStorage.removeItem(automaticallySwitchApplicationThemeKey)

  if (automaticallySwitchApplicationTheme) {
    setPersistedTheme(ApplicationTheme.System)
    localStorage.removeItem(applicationThemeKey)
    return 'system'
  }

  const legacyValue = localStorage.getItem(applicationThemeKey)

  if (legacyValue === null) {
    return null
  }

  const shouldUseDark = legacyValue === 'dark'

  if (shouldUseDark) {
    setPersistedTheme(ApplicationTheme.Dark)
  } else {
    setPersistedTheme(ApplicationTheme.Light)
  }

  localStorage.removeItem(applicationThemeKey)

  return shouldUseDark ? 'dark' : 'light'
}

/**
 * Load the name of the currently selected theme
 */
export function getPersistedThemeName(): string {
  const setting = checkLegacyThemeSetting()

  if (setting === null) {
    return remote.nativeTheme.themeSource
  }

  return setting
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
    // was released October 2nd, 2018 and the feature can just be "attained" by upgrading
    // See https://github.com/desktop/desktop/issues/9015 for more
    return isWindows10And1809Preview17666OrLater()
  }

  return false
}

function isDarkModeEnabled(): boolean {
  return remote.nativeTheme.shouldUseDarkColors
}
