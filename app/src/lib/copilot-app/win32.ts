import { win32 as Path } from 'path'

type Hive = 'HKEY_CURRENT_USER' | 'HKEY_LOCAL_MACHINE'
type RegistryValues = ReadonlyArray<{
  readonly name: string
  readonly data: unknown
}>

/** Registry access used to discover both NSIS and MSI installations. */
export interface ICopilotAppRegistry {
  readonly readValues: (hive: Hive, key: string) => RegistryValues
  readonly readKeys: (hive: Hive, key: string) => ReadonlyArray<string>
}

const uninstallKey = 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
const wowUninstallKey =
  'Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'

function unquote(value: string): string {
  return value.trim().replace(/^"(.*)"$/, '$1')
}

function getPaths(values: RegistryValues): ReadonlyArray<string> {
  const get = (name: string) => {
    const value = values.find(v => v.name.toLowerCase() === name.toLowerCase())
    return typeof value?.data === 'string' ? value.data : ''
  }

  if (
    get('DisplayName') !== 'GitHub Copilot' ||
    get('Publisher') !== 'GitHub Inc.'
  ) {
    return []
  }

  const location = unquote(get('InstallLocation'))
  const binary = unquote(get('MainBinaryName')) || 'github.exe'
  const icon = unquote(
    get('DisplayIcon')
      .trim()
      .replace(/,\s*-?\d+\s*$/, '')
  )
  const paths = []
  if (
    Path.isAbsolute(location) &&
    Path.basename(binary) === binary &&
    binary.toLowerCase().endsWith('.exe')
  ) {
    paths.push(Path.join(location, binary))
  }
  if (Path.isAbsolute(icon) && icon.toLowerCase().endsWith('.exe')) {
    paths.push(icon)
  }
  return paths
}

/**
 * Return installation candidates, including custom install locations. Callers
 * must validate candidates on disk before using them.
 */
export function getWindowsCopilotAppCandidates(
  registry: ICopilotAppRegistry,
  env: NodeJS.ProcessEnv
): ReadonlyArray<string> {
  const paths = new Set<string>()
  for (const hive of ['HKEY_CURRENT_USER', 'HKEY_LOCAL_MACHINE'] as const) {
    for (const parent of [uninstallKey, wowUninstallKey]) {
      const read = (key: string) => {
        try {
          getPaths(registry.readValues(hive, `${parent}\\${key}`)).forEach(p =>
            paths.add(p)
          )
        } catch (error) {
          log.debug(`Could not read ${hive}\\${parent}\\${key}`, error)
        }
      }
      read('GitHub Copilot')
      try {
        registry.readKeys(hive, parent).forEach(read)
      } catch (error) {
        log.debug(`Could not enumerate ${hive}\\${parent}`, error)
      }
    }
  }

  for (const root of [
    env.LOCALAPPDATA,
    env.ProgramFiles,
    env['ProgramFiles(x86)'],
  ]) {
    if (root && Path.isAbsolute(root)) {
      paths.add(Path.join(root, 'GitHub Copilot', 'github.exe'))
    }
  }
  if (env.LOCALAPPDATA && Path.isAbsolute(env.LOCALAPPDATA)) {
    paths.add(
      Path.join(env.LOCALAPPDATA, 'Programs', 'GitHub Copilot', 'github.exe')
    )
  }
  return [...paths]
}

/** Discover Windows installation candidates without loading native code elsewhere. */
export async function findWindowsCopilotAppCandidates(): Promise<
  ReadonlyArray<string>
> {
  const registry = await import('registry-js')
  return getWindowsCopilotAppCandidates(
    {
      readValues: (hive, key) =>
        registry.enumerateValues(registry.HKEY[hive], key),
      readKeys: (hive, key) => registry.enumerateKeys(registry.HKEY[hive], key),
    },
    process.env
  )
}
