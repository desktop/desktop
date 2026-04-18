import { readdir, readFile } from 'fs/promises'
import * as Path from 'path'

const legacyProfileFolderName = 'GitHub Desktop'
const indexedDbFolderSegments = ['IndexedDB', 'file__0.indexeddb.leveldb']
const localStorageFolderSegments = ['Local Storage', 'leveldb']
const candidateFilePattern = /\.(?:ldb|log)$/i
const windowsPathPattern = /[A-Za-z]:\\[^\x00-\x1f"<>|?*]*/g
const posixPathPattern = /\/(?:[^\x00-\x1f"<>|?*\/]+\/)+[^\x00-\x1f"<>|?*\/]*/g

export function getGitHubDesktopProfilePath(appDataPath: string) {
  return Path.join(appDataPath, legacyProfileFolderName)
}

export function getGitHubDesktopStorageDirectories(appDataPath: string) {
  const profilePath = getGitHubDesktopProfilePath(appDataPath)

  return getGitHubDesktopStorageDirectoriesForProfilePath(profilePath)
}

export function getGitHubDesktopStorageDirectoriesForProfilePath(
  profilePath: string
) {
  return [
    Path.join(profilePath, ...indexedDbFolderSegments),
    Path.join(profilePath, ...localStorageFolderSegments),
  ]
}

export function extractGitHubDesktopRepositoryPathsFromText(content: string) {
  const paths = new Set<string>()

  for (const pattern of [windowsPathPattern, posixPathPattern]) {
    for (const match of content.matchAll(pattern)) {
      const path = sanitizeImportedRepositoryPath(match[0])
      if (path !== null) {
        paths.add(path)
      }
    }
  }

  return [...paths].sort()
}

export async function readGitHubDesktopRepositoryPaths(
  appDataPath: string
): Promise<ReadonlyArray<string>> {
  const directories = getGitHubDesktopStorageDirectories(appDataPath)
  const paths = new Set<string>()

  for (const directory of directories) {
    const entries = await readdir(directory, { withFileTypes: true }).catch(
      () => []
    )

    for (const entry of entries) {
      if (!entry.isFile() || !candidateFilePattern.test(entry.name)) {
        continue
      }

      const filePath = Path.join(directory, entry.name)
      const content = await readFile(filePath).catch(() => null)
      if (content === null) {
        continue
      }

      for (const repositoryPath of extractGitHubDesktopRepositoryPathsFromText(
        content.toString('latin1')
      )) {
        paths.add(repositoryPath)
      }
    }
  }

  return [...paths].sort()
}

function sanitizeImportedRepositoryPath(path: string) {
  const withoutControlCharacters = path
    .replace(/[\x00-\x1f"]+/g, '')
    .replace(/[\u0080-\u009f]+/g, '')
    .trim()
  if (withoutControlCharacters.length === 0) {
    return null
  }

  if (/^[A-Za-z]:\\/.test(withoutControlCharacters)) {
    return trimTrailingSeparator(
      Path.win32.normalize(withoutControlCharacters),
      Path.win32.sep
    )
  }

  if (withoutControlCharacters.startsWith('/')) {
    return trimTrailingSeparator(
      Path.posix.normalize(withoutControlCharacters),
      Path.posix.sep
    )
  }

  return null
}

function trimTrailingSeparator(path: string, separator: string) {
  if (path === separator || /^[A-Za-z]:\\$/.test(path)) {
    return path
  }

  return path.endsWith(separator) ? path.slice(0, -1) : path
}
