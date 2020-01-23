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
