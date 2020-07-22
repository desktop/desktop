import { spawn as spawnInternal } from 'child_process'
import * as Path from 'path'
import {
  HKEY,
  RegistryValueType,
  RegistryValue,
  RegistryStringEntry,
  enumerateValues,
} from 'registry-js'

function isStringRegistryValue(rv: RegistryValue): rv is RegistryStringEntry {
  return (
    rv.type === RegistryValueType.REG_SZ ||
    rv.type === RegistryValueType.REG_EXPAND_SZ
  )
}

/** Get the path segments in the user's `Path`. */
export function getPathSegments(): ReadonlyArray<string> {
  for (const value of enumerateValues(HKEY.HKEY_CURRENT_USER, 'Environment')) {
    if (value.name === 'Path' && isStringRegistryValue(value)) {
      return value.data.split(';').filter(x => x.length > 0)
    }
  }

  throw new Error('Could not find PATH environment variable')
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

      // If Node.js encounters a synchronous runtime error while spawning
      // `stdout` will be undefined and the error will be emitted asynchronously
      if (child.stdout) {
        child.stdout.on('data', data => {
          stdout += data
        })
      }

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

      if (child.stdin) {
        // This is necessary if using Powershell 2 on Windows 7 to get the events
        // to raise.
        // See http://stackoverflow.com/questions/9155289/calling-powershell-from-nodejs
        child.stdin.end()
      }
    })
  } catch (error) {
    return Promise.reject(error)
  }
}
