import { remote } from 'electron'
import { isMojaveOrLater, is1809OrLater } from '../../lib/get-os'

export function supportsDarkMode() {
  if (__DARWIN__) {
    return isMojaveOrLater()
  } else if (__WIN32__) {
    return is1809OrLater()
  }

  return false
}

export function isDarkModeEnabled() {
  if (!supportsDarkMode()) {
    return false
  }

  // remote is an IPC call, so if we know there's no point making this call
  // we should avoid paying the IPC tax
  return remote.nativeTheme.shouldUseDarkColors
}
