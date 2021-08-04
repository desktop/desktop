import * as fse from 'fs-extra'
import memoizeOne from 'memoize-one'

const WindowsOpenSSHPath = 'C:\\Windows\\System32\\OpenSSH\\ssh.exe'

export const isWindowsSSHAvailable = memoizeOne(
  async (): Promise<boolean> => {
    if (!__WIN32__) {
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
  const useWindowsSSH = await isWindowsSSHAvailable()
  if (!useWindowsSSH) {
    return []
  }

  // Replace git sshCommand with Windows' OpenSSH executable path
  return ['-c', `core.sshCommand="${WindowsOpenSSHPath}"`]
}
