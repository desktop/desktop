import * as Path from 'path'

/**
 * Get the path to the PowerShell executable.
 *
 * If the %SystemRoot% environment variable set, will return the absolute path.
 * If not found, it assumes PowerShell is on the PATH.
 */
export function getPowerShellPath(): string {
  const systemRoot = process.env['SystemRoot']
  if (systemRoot) {
    const system32Path = Path.join(process.env.SystemRoot, 'System32')
    return Path.join(
      system32Path,
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe'
    )
  } else {
    return 'powershell.exe'
  }
}
