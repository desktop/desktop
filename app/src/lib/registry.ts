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
  const script = `Get-ItemProperty "${key}" | Out-String`
  const stdout = await executePowerShellScript(script)
  const output = stdout.trim()

  if (output.length === 0) {
    return []
  }

  const results = new Array<IRegistryEntry>()
  const lines = stdout.split('\n')

  for (const line of lines) {
    if (line.length === 0 || line.indexOf(' : ') === -1) {
      // skip rows which aren't formatted in the expected way
      continue
    }

    const [left, right] = line.split(' : ')
    const name = left.trim()
    const value = right.trim()

    // PowerShell won't let you exclude the default properties
    // when interacting with the registry. We'll skip over these
    // because the caller doesn't care about them too
    if (isStandardPowershellProperty(name)) {
      continue
    }

    results.push({ name, value })
  }

  return results
}
