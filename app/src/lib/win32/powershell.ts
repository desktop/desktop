import * as Path from 'path'
import { spawn } from './spawn'
/**
 * Get the path to the PowerShell executable.
 *
 * If the %SystemRoot% environment variable set, will return the absolute path.
 * If not found, it assumes PowerShell is on the PATH.
 */
function getPowerShellPath(): string {
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

export function executePowerShellScript(script: string): Promise<string> {
  const args = [
    '-noprofile',
    '-ExecutionPolicy',
    'RemoteSigned',
    '-command',
    // Set encoding and execute the command, capture the output, and return it
    // via .NET's console in order to have consistent UTF-8 encoding.
    // See http://stackoverflow.com/questions/22349139/utf-8-output-from-powershell
    // to address https://github.com/atom/atom/issues/5063
    `
      [Console]::OutputEncoding=[System.Text.Encoding]::UTF8
      $output = ${script}
      [Console]::WriteLine($output)
    `,
  ]

  return spawn(getPowerShellPath(), args)
}
