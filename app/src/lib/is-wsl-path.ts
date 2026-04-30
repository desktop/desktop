// Matches \\wsl$\<distro>\… and \\wsl.localhost\<distro>\… (both slash styles).
// Captures [1] = distro name, [2] = remainder path after distro.
const wslUNCPattern =
  /^(?:\/\/|\\\\)wsl(?:\$|\.localhost)(?:\/|\\)([^/\\]+)(?:(?:\/|\\)(.*))?$/i

const distroCache = new Map<string, string>()

export function isWSLPath(repositoryPath: string): boolean {
  return wslUNCPattern.test(repositoryPath)
}

export function getWSLDistroName(repositoryPath: string): string | null {
  const cached = distroCache.get(repositoryPath)
  if (cached) {
    return cached
  }
  const match = repositoryPath.match(wslUNCPattern)
  if (!match) {
    return null
  }
  distroCache.set(repositoryPath, match[1])
  return match[1]
}

// Converts \\wsl$\Ubuntu\home\user\repo → /home/user/repo
// Returns null for non-WSL paths.
export function wslUNCToPosixPath(repositoryPath: string): string | null {
  const match = repositoryPath.match(wslUNCPattern)
  if (!match) {
    return null
  }
  const remainder = match[2] ?? ''
  return '/' + remainder.replace(/\\/g, '/')
}
