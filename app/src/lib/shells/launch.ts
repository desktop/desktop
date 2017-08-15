import * as Darwin from './darwin'
import * as Win32 from './win32'
import { Shell } from './index'

export async function launchShell(shell: Shell) {
  // We have to manually cast the wider `Shell` type into the platform-specific
  // type. This is less than ideal, but maybe the best we can do without
  // platform-specific build targets.
  if (__DARWIN__) {
    return Darwin.launch(shell as Darwin.Shell)
  } else if (__WIN32__) {
    return Win32.launch(shell as Win32.Shell)
  }

  return Promise.reject(
    `Platform not currently supported for launching shells: ${process.platform}`
  )
}
