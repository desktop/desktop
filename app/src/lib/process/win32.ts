import { spawn as spawnInternal } from 'child_process'
import * as Path from 'path'
import {
  HKEY,
  RegistryValueType,
  RegistryValue,
  RegistryStringEntry,
  enumerateValues,
  setValue,
} from 'registry-js'

function isStringRegistryValue(rv: RegistryValue): rv is RegistryStringEntry {
  return (
    rv.type === RegistryValueType.REG_SZ ||
    rv.type === RegistryValueType.REG_EXPAND_SZ
  )
}

export function getPathRegistryValue(): RegistryStringEntry | null {
  for (const value of enumerateValues(HKEY.HKEY_CURRENT_USER, 'Environment')) {
    if (value.name === 'Path' && isStringRegistryValue(value)) {
      return value
    }
  }

  return null
}

/** Get the path segments in the user's `Path`. */
export function getPathSegments(): ReadonlyArray<string> {
  const value = getPathRegistryValue()

  if (value === null) {
    throw new Error('Could not find PATH environment variable')
  }

  return value.data.split(';').filter(x => x.length > 0)
}

/** Set the user's `Path`. */
export async function setPathSegments(
  paths: ReadonlyArray<string>
): Promise<void> {
  const value = getPathRegistryValue()
  if (value === null) {
    throw new Error('Could not find PATH environment variable')
  }

  try {
    setValue(
      HKEY.HKEY_CURRENT_USER,
      'Environment',
      'Path',
      value.type,
      paths.join(';')
    )

    // HACK: We need to notify Windows that the environment has changed. We will
    // leverage setx to do this using a dummy environment variable.
    await spawnSetX('GITHUB_DESKTOP_ENV_VAR_CHANGE', '1')
  } catch (e) {
    log.error('Failed setting PATH environment variable', e)

    throw new Error('Could not set the PATH environment variable')
  }
}

async function spawnSetX(variable: string, value: string) {
  let setxPath: string
  const systemRoot = process.env['SystemRoot']
  if (systemRoot) {
    const system32Path = Path.join(systemRoot, 'System32')
    setxPath = Path.join(system32Path, 'setx.exe')
  } else {
    setxPath = 'setx.exe'
  }

  await spawn(setxPath, [variable, value])
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
