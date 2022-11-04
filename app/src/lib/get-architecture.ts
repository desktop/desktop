import { App } from 'electron'

export type Architecture = 'x64' | 'arm64' | 'x64-emulated'

/**
 * Returns the architecture of the build currently running, which could be
 * either x64 or arm64. Additionally, it could also be x64-emulated in those
 * arm64 devices with the ability to emulate x64 binaries (like macOS using
 * Rosetta).
 */
export function getArchitecture(app: App): Architecture {
  if (isAppRunningUnderARM64Translation(app)) {
    return 'x64-emulated'
  }

  return process.arch === 'arm64' ? 'arm64' : 'x64'
}

/**
 * Returns true if the app is an x64 process running under arm64 translation.
 */
export function isAppRunningUnderARM64Translation(app: App): boolean {
  // HACK: We cannot just use runningUnderARM64Translation because on Windows,
  // it relies on IsWow64Process2 which, as of today, on Windows 11 (22000.469),
  // always returns IMAGE_FILE_MACHINE_UNKNOWN as the process machine, which
  // indicates that the process is NOT being emulated. This means, Electron's
  // runningUnderARM64Translation will always return true for arm binaries on
  // Windows, so we will use process.arch to check if node (and therefore the
  // whole process) was compiled for x64.
  return process.arch === 'x64' && app.runningUnderARM64Translation === true
}
