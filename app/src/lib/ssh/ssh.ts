import memoizeOne from 'memoize-one'
import { pathExists } from '../../ui/lib/path-exists'
import { getBoolean } from '../local-storage'
import {
  getDesktopAskpassTrampolinePath,
  getSSHWrapperPath,
} from '../trampoline/trampoline-environment'

const WindowsOpenSSHPath = 'C:/Windows/System32/OpenSSH/ssh.exe'

export const UseWindowsOpenSSHKey: string = 'useWindowsOpenSSH'

export const isWindowsOpenSSHAvailable = memoizeOne(
  async (): Promise<boolean> => {
    if (!__WIN32__) {
      return false
    }

    // FIXME: for now, seems like we can't use Windows' OpenSSH binary on Windows
    // for ARM.
    if (process.arch === 'arm64') {
      return false
    }

    return await pathExists(WindowsOpenSSHPath)
  }
)

// HACK: The purpose of this function is to wrap `getBoolean` inside a try/catch
// block, because for some reason, accessing localStorage from tests sometimes
// fails.
function isWindowsOpenSSHUseEnabled() {
  try {
    return getBoolean(UseWindowsOpenSSHKey, false)
  } catch (e) {
    return false
  }
}

/**
 * Returns the git environment variables related to SSH depending on the current
 * context (OS and user settings).
 */
export async function getSSHEnvironment() {
  const baseEnv = {
    SSH_ASKPASS: getDesktopAskpassTrampolinePath(),
    // DISPLAY needs to be set to _something_ so ssh actually uses SSH_ASKPASS
    DISPLAY: '.',
  }

  const canUseWindowsSSH = await isWindowsOpenSSHAvailable()
  if (canUseWindowsSSH && isWindowsOpenSSHUseEnabled()) {
    // Replace git ssh command with Windows' OpenSSH executable path
    return {
      ...baseEnv,
      GIT_SSH_COMMAND: WindowsOpenSSHPath,
    }
  }

  if (__DARWIN__ && __DEV__) {
    // Replace git ssh command with our wrapper in dev builds, since they are
    // launched from a command line.
    return {
      ...baseEnv,
      GIT_SSH_COMMAND: `"${getSSHWrapperPath()}"`,
    }
  }

  return baseEnv
}

export function parseAddSSHHostPrompt(prompt: string) {
  const promptRegex =
    /^The authenticity of host '([^ ]+) \(([^\)]+)\)' can't be established[^.]*\.\n([^ ]+) key fingerprint is ([^.]+)\./

  const matches = promptRegex.exec(prompt)
  if (matches === null || matches.length < 5) {
    return null
  }

  return {
    host: matches[1],
    ip: matches[2],
    keyType: matches[3],
    fingerprint: matches[4],
  }
}
