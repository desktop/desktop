import { remote } from 'electron'

export type Architecture = 'x64' | 'arm64' | 'x64-emulated'

/**
 * Returns the architecture of the build currently running, which could be
 * either x64 or arm64. Additionally, it could also be x64-emulated in those
 * arm64 devices with the ability to emulate x64 binaries (like macOS using
 * Rosetta).
 */
export function getArchitecture(): Architecture {
  // TODO: Check if it's x64 running on an arm64 Windows with IsWow64Process2
  // More info: https://www.rudyhuyn.com/blog/2017/12/13/how-to-detect-that-your-x86-application-runs-on-windows-on-arm/
  // Right now (April 26, 2021) is not very important because support for x64
  // apps on an arm64 Windows is experimental. See:
  // https://blogs.windows.com/windows-insider/2020/12/10/introducing-x64-emulation-in-preview-for-windows-10-on-arm-pcs-to-the-windows-insider-program/
  if (remote.app.runningUnderRosettaTranslation === true) {
    return 'x64-emulated'
  }

  return process.arch === 'arm64' ? 'arm64' : 'x64'
}
