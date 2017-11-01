import * as Path from 'path'
import * as ChildProcess from 'child_process'

// TODO: extract this so it's shared with squirrel-updater
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

// TODO: this is also shared with squirrel-updater - can we unify this?

/** Spawn a command with arguments and capture its output. */
function spawn(command: string, args: ReadonlyArray<string>): Promise<string> {
  try {
    const child = ChildProcess.spawn(command, args as string[])
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

export interface IRegistryEntry {
  readonly name: string
  readonly value: string
}

/**
 * These entries may be returned whenever PowerShell is reading a registry
 * entry. We don't care about them, it's just noise.
 */
const standardPowerShellProperties = [
  'PSPath',
  'PSParentPath',
  'PSChildName',
  'PSDrive',
  'PSProvider',
]

function isStandardPowershellProperty(name: string): boolean {
  return standardPowerShellProperties.indexOf(name) > -1
}

/**
 * Read registry keys found at the expected location.
 *
 * This method will return an empty list if the expected key does not exist,
 * instead of throwing an error.
 *
 * @param key The registry key to lookup
 */
export async function readRegistryKeySafe(
  key: string
): Promise<ReadonlyArray<IRegistryEntry>> {
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
      $output = get-itemproperty "${key}" | ConvertTo-Json -Depth 1
      [Console]::WriteLine($output)
    `,
  ]

  const results = new Array<IRegistryEntry>()

  const stdout = await spawn(getPowerShellPath(), args)
  const jsonText = stdout.trim()

  if (jsonText.length) {
    try {
      const json = JSON.parse(stdout)

      for (const [name, value] of Object.entries(json)) {
        // PowerShell won't let you exclude the default properties
        // when interacting with the registry. We'll skip over these
        // because the caller doesn't care about them too
        if (isStandardPowershellProperty(name)) {
          continue
        }

        // PowerShell may return objects when serializing - this is to
        // ensure we don't accidentally also share those with the caller
        if (typeof value === 'string') {
          results.push({ name, value })
        }
      }
    } catch (err) {
      debugger
      log.debug(
        `unable to parse JSON returned from registry for key: ${key}`,
        err
      )
      log.debug(`JSON text: '${jsonText}'`)
    }
  }

  return results
}
