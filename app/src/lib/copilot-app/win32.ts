import { basename, isAbsolute, join } from 'path'
import { enumerateKeys, enumerateValues, HKEY } from 'registry-js'

type Hive = 'HKEY_CURRENT_USER' | 'HKEY_LOCAL_MACHINE'
type RegistryValues = ReadonlyArray<
  | {
      readonly name: string
      readonly data: unknown
    }
  | null
  | undefined
>

/** Registry access used to discover both NSIS and MSI installations. */
export interface ICopilotAppRegistry {
  readonly readValues: (hive: Hive, key: string) => RegistryValues
  readonly readKeys: (hive: Hive, key: string) => ReadonlyArray<string>
}

const uninstallKey = 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
const wowUninstallKey =
  'Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'

/** Resolve a configured executable path to the GitHub CLI executable. */
export function getCopilotAppExecutable(path: string): string | null {
  return isAbsolute(path) &&
    !path.includes('\0') &&
    path.toLowerCase().endsWith('.exe')
    ? path
    : null
}

function unquote(value: string): string {
  return value.trim().replace(/^"(.*)"$/, '$1')
}

function getPaths(values: RegistryValues): ReadonlyArray<string> {
  const get = (name: string) => {
    const value = values.find(v => v?.name.toLowerCase() === name.toLowerCase())
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
  const candidates = []
  if (
    isAbsolute(location) &&
    basename(binary) === binary &&
    binary.toLowerCase().endsWith('.exe')
  ) {
    candidates.push(join(location, binary))
  }
  if (isAbsolute(icon) && icon.toLowerCase().endsWith('.exe')) {
    candidates.push(icon)
  }
  return candidates
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
    if (root && isAbsolute(root)) {
      paths.add(join(root, 'GitHub Copilot', 'github.exe'))
    }
  }
  if (env.LOCALAPPDATA && isAbsolute(env.LOCALAPPDATA)) {
    paths.add(
      join(env.LOCALAPPDATA, 'Programs', 'GitHub Copilot', 'github.exe')
    )
  }
  return [...paths]
}

/** Discover Windows installation candidates without loading native code elsewhere. */
export async function findCopilotAppCandidates(): Promise<
  ReadonlyArray<string>
> {
  return getWindowsCopilotAppCandidates(
    {
      readValues: (hive, key) => enumerateValues(HKEY[hive], key),
      readKeys: (hive, key) => enumerateKeys(HKEY[hive], key),
    },
    process.env
  )
}
