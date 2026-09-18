import { execFileSync } from 'child_process'
import * as Path from 'path'

/**
 * Allow sandboxed Chromium processes to read the installed application files.
 * AppContainer-specific entries inherited from a parent directory can otherwise
 * prevent startup even when the current user has access (electron/electron#51761).
 */
export function grantWindowsSandboxPermissions(appFolder: string): void {
  const icacls = Path.join(
    process.env.SystemRoot || 'C:\\Windows',
    'System32',
    'icacls.exe'
  )

  // Run before Electron can start its sandboxed children. Only grant read and
  // execute access to this version's binaries, never the user's app data.
  // /grant preserves existing permissions; inheritance covers files and folders.
  execFileSync(icacls, [appFolder, '/grant', '*S-1-15-2-2:(OI)(CI)(RX)'], {
    windowsHide: true,
    stdio: 'pipe',
    timeout: 10000,
  })
}
