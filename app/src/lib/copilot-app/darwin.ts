import appPath from 'app-path'
import { homedir } from 'os'
import { isAbsolute, join, normalize } from 'path'

const bundleIdentifier = 'com.github.githubapp'
const appName = 'GitHub Copilot.app'

/** Resolve a configured app bundle to its GitHub CLI executable. */
export function getCopilotAppExecutable(path: string): string | null {
  if (!isAbsolute(path) || path.includes('\0')) {
    return null
  }

  const normalized = normalize(path).replace(/\/$/, '')
  if (normalized.endsWith('.app')) {
    return join(normalized, 'Contents', 'MacOS', 'github')
  }

  return normalized.endsWith('.app/Contents/MacOS/github') ? normalized : null
}

/** Return macOS installation candidates from discovered and standard paths. */
export function getCopilotAppCandidates(
  found: string | null,
  homeDirectory: string
): ReadonlyArray<string> {
  return [
    ...(found === null ? [] : [found]),
    join('/Applications', appName),
    join(homeDirectory, 'Applications', appName),
  ]
}

/** Return known macOS installation candidates for GitHub Copilot. */
export async function findCopilotAppCandidates(): Promise<
  ReadonlyArray<string>
> {
  const found = await appPath(bundleIdentifier).catch(error => {
    log.debug('Could not locate GitHub Copilot using Launch Services', error)
    return null
  })

  return getCopilotAppCandidates(found, homedir())
}
