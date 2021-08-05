import * as fse from 'fs-extra'
import memoizeOne from 'memoize-one'
import { enableWindowsOpenSSH } from '../feature-flag'
import { getBoolean } from '../local-storage'

const WindowsOpenSSHPath = 'C:\\Windows\\System32\\OpenSSH\\ssh.exe'

export const UseWindowsOpenSSHKey: string = 'useWindowsOpenSSH'

export const isWindowsOpenSSHAvailable = memoizeOne(
  async (): Promise<boolean> => {
    if (!__WIN32__ || !enableWindowsOpenSSH()) {
      return false
    }

    return await fse.pathExists(WindowsOpenSSHPath)
  }
)

/**
 * Returns the git arguments related to SSH depending on the current context
 * (OS and user settings).
 */
export async function getSSHArguments() {
  const canUseWindowsSSH = await isWindowsOpenSSHAvailable()
  if (!canUseWindowsSSH || !getBoolean(UseWindowsOpenSSHKey, false)) {
    return []
  }

  // Replace git sshCommand with Windows' OpenSSH executable path
  return ['-c', `core.sshCommand="${WindowsOpenSSHPath}"`]
}
