import { remote } from 'electron'
import {
  isMacOsAndMojaveOrLater,
  isWindows10And1809Preview17666OrLater,
} from '../../lib/get-os'

export function supportsDarkMode() {
  if (__DARWIN__) {
    return isMacOsAndMojaveOrLater()
  } else if (__WIN32__) {
    // Its technically possible this would still work on prior versions of Windows 10 but 1809
    // was released October 2nd, 2018 that the feature can just be "attained" by upgrading
    // See https://github.com/desktop/desktop/issues/9015 for more
    return isWindows10And1809Preview17666OrLater()
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
