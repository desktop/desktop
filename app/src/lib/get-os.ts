import * as OS from 'os'
import { compare } from 'compare-versions'
import memoizeOne from 'memoize-one'

/** Get the OS we're currently running on. */
export function getOS() {
  if (__DARWIN__) {
    return `Mac OS ${process.getSystemVersion()}`
  } else if (__WIN32__) {
    return `Windows ${OS.release()}`
  } else {
    return `${OS.type()} ${OS.release()}`
  }
}

/** We're currently running macOS and it is at least Mojave. */
export const isMacOsAndMojaveOrLater = memoizeOne(
  () => __DARWIN__ && compare(process.getSystemVersion(), '10.13.0', '>=')
)

/** We're currently running macOS and it is at least Big Sur. */
export const isMacOSBigSurOrLater = memoizeOne(
  () => __DARWIN__ && compare(process.getSystemVersion(), '11.0.0', '>=')
)

/** We're currently running Windows 10 and it is at least 1809 Preview Build 17666. */
export function isWindows10And1809Preview17666OrLater() {
  if (__WIN32__) {
    const version = OS.release()

    if (version === undefined) {
      return false
    }

    return compare(version, '10.0.17666', '>=')
  }
  return false
}
