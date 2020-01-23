import { nativeTheme } from 'electron'
import { isMojaveOrLater } from '../../lib/get-os'

export function supportsDarkMode() {
  if (!__DARWIN__) {
    return false
  }

  return isMojaveOrLater()
}

export function isDarkModeEnabled() {
  if (!supportsDarkMode()) {
    return false
  }

  return nativeTheme.shouldUseDarkColors
}
