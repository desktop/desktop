import { compare } from 'compare-versions'
import * as OS from 'os'
import { UAParser } from 'ua-parser-js'

/** Get the OS we're currently running on. */
export function getOS() {
  if (__DARWIN__) {
    // On macOS, OS.release() gives us the kernel version which isn't terribly
    // meaningful to any human being, so we'll parse the User Agent instead.
    // See https://github.com/desktop/desktop/issues/1130.
    const parser = new UAParser()
    const os = parser.getOS()
    return `${os.name} ${os.version}`
  } else if (__WIN32__) {
    return `Windows ${OS.release()}`
  } else {
    return `${OS.type()} ${OS.release()}`
  }
}

/** We're currently running macOS and it is at least Mojave. */
export function isMacOsAndMojaveOrLater() {
  if (__DARWIN__) {
    const parser = new UAParser()
    const os = parser.getOS()

    if (os.version === undefined) {
      return false
    }

    return compare(os.version, '10.13.0', '>=')
  }
  return false
}

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
