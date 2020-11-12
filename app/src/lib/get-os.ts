import * as OS from 'os'
import { compare } from 'compare-versions'
import memoizeOne from 'memoize-one'

function getSystemVersionSafe() {
  // getSystemVersion only exists when running under Electron, and not when
  // running unit tests which frequently end up calling this. There are no
  // other known reasons why getSystemVersion() would return anything other
  // than a string
  return 'getSystemVersion' in process ? process.getSystemVersion() : undefined
}

function systemVersionGreaterThanOrEqualTo(version: string) {
  const sysver = getSystemVersionSafe()
  return sysver === undefined ? false : compare(sysver, version, '>=')
}

/** Get the OS we're currently running on. */
export function getOS() {
  if (__DARWIN__) {
    return `Mac OS ${getSystemVersionSafe()}`
  } else if (__WIN32__) {
    return `Windows ${OS.release()}`
  } else {
    return `${OS.type()} ${OS.release()}`
  }
}

/** We're currently running macOS and it is at least Mojave. */
export const isMacOsAndMojaveOrLater = memoizeOne(
  () => __DARWIN__ && systemVersionGreaterThanOrEqualTo('10.13.0')
)

/** We're currently running macOS and it is at least Big Sur. */
export const isMacOSBigSurOrLater = memoizeOne(
  () => __DARWIN__ && systemVersionGreaterThanOrEqualTo('11.0.0')
)

/** We're currently running Windows 10 and it is at least 1809 Preview Build 17666. */
export const isWindows10And1809Preview17666OrLater = memoizeOne(
  () => __WIN32__ && systemVersionGreaterThanOrEqualTo('10.0.17666')
)
