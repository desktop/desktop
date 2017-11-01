import { executePowerShellScript } from './win32/powershell'

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
  const results = new Array<IRegistryEntry>()
  const script = `Get-ItemProperty "${key}" | ConvertTo-Json -Depth 1`
  const stdout = await executePowerShellScript(script)
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
