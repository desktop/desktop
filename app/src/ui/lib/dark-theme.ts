import { nativeTheme } from 'electron'

export function isDarkModeEnabled() {
  return nativeTheme.shouldUseDarkColors
}
