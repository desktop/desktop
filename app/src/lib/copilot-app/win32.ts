import { basename, isAbsolute, join } from 'path'
import { enumerateValues, HKEY } from 'registry-js'

type RegistryValues = ReadonlyArray<
  | {
      readonly name: string
      readonly data: unknown
    }
  | null
  | undefined
>

/** Registry access used to discover custom NSIS installations. */
export interface ICopilotAppRegistry {
  readonly readValues: (key: string) => RegistryValues
}

const uninstallKey = 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
const copilotUninstallKey = `${uninstallKey}\\GitHub Copilot`

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
  try {
    getPaths(registry.readValues(copilotUninstallKey)).forEach(path =>
      paths.add(path)
    )
  } catch (error) {
    log.debug(`Could not read HKEY_CURRENT_USER\\${copilotUninstallKey}`, error)
  }

  if (env.LOCALAPPDATA && isAbsolute(env.LOCALAPPDATA)) {
    paths.add(
      join(env.LOCALAPPDATA, 'Programs', 'GitHub Copilot', 'github.exe')
    )
  }
  if (env.ProgramFiles && isAbsolute(env.ProgramFiles)) {
    paths.add(join(env.ProgramFiles, 'GitHub Copilot', 'github.exe'))
  }
  return [...paths]
}

/** Discover Windows installation candidates without loading native code elsewhere. */
export async function findCopilotAppCandidates(): Promise<
  ReadonlyArray<string>
> {
  return getWindowsCopilotAppCandidates(
    {
      readValues: key => enumerateValues(HKEY.HKEY_CURRENT_USER, key),
    },
    process.env
  )
}
