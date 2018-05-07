import { spawn as spawnInternal } from 'child_process'
import * as Path from 'path'

/** Get the path segments in the user's `Path`. */
export async function getPathSegments(): Promise<ReadonlyArray<string>> {
  let powershellPath: string
  const systemRoot = process.env.SystemRoot
  if (systemRoot != null) {
    const system32Path = Path.join(systemRoot, 'System32')
    powershellPath = Path.join(
      system32Path,
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe'
    )
  } else {
    powershellPath = 'powershell.exe'
  }

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
      $output=[environment]::GetEnvironmentVariable('Path', 'User')
      [Console]::WriteLine($output)
    `,
  ]

  const stdout = await spawn(powershellPath, args)
  const pathOutput = stdout.replace(/^\s+|\s+$/g, '')
  return pathOutput.split(/;+/).filter(segment => segment.length)
}

/** Set the user's `Path`. */
export async function setPathSegments(
  paths: ReadonlyArray<string>
): Promise<void> {
  let setxPath: string
  const systemRoot = process.env['SystemRoot']
  if (systemRoot) {
    const system32Path = Path.join(systemRoot, 'System32')
    setxPath = Path.join(system32Path, 'setx.exe')
  } else {
    setxPath = 'setx.exe'
  }

  await spawn(setxPath, ['Path', paths.join(';')])
}

/** Spawn a command with arguments and capture its output. */
export function spawn(
  command: string,
  args: ReadonlyArray<string>
): Promise<string> {
  try {
    const child = spawnInternal(command, args as string[])
    return new Promise<string>((resolve, reject) => {
      let stdout = ''
      child.stdout.on('data', data => {
        stdout += data
      })

      child.on('close', code => {
        if (code === 0) {
          resolve(stdout)
        } else {
          reject(new Error(`Command "${command} ${args}" failed: "${stdout}"`))
        }
      })

      child.on('error', (err: Error) => {
        reject(err)
      })

      // This is necessary if using Powershell 2 on Windows 7 to get the events
      // to raise.
      // See http://stackoverflow.com/questions/9155289/calling-powershell-from-nodejs
      child.stdin.end()
    })
  } catch (error) {
    return Promise.reject(error)
  }
}
