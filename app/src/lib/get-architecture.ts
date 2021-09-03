import { App } from 'electron'
import { isRunningUnderARM64Translation } from 'detect-arm64-translation'

export type Architecture = 'x64' | 'arm64' | 'x64-emulated'

/**
 * Returns the architecture of the build currently running, which could be
 * either x64 or arm64. Additionally, it could also be x64-emulated in those
 * arm64 devices with the ability to emulate x64 binaries (like macOS using
 * Rosetta).
 */
export function getArchitecture(app: App): Architecture {
  if (
    app.runningUnderRosettaTranslation === true ||
    isRunningUnderARM64Translation() === true
  ) {
    return 'x64-emulated'
  }

  return process.arch === 'arm64' ? 'arm64' : 'x64'
}
