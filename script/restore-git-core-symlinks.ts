import {
  existsSync,
  lstatSync,
  readlinkSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from 'fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path'

function isWithinDirectory(directory: string, candidate: string) {
  const relativePath = relative(directory, candidate)
  return (
    relativePath === '' ||
    (!isAbsolute(relativePath) &&
      relativePath !== '..' &&
      !relativePath.startsWith('..' + sep))
  )
}

function findSymlinks(directory: string): string[] {
  const symlinks: string[] = []

  for (const name of readdirSync(directory)) {
    const entryPath = join(directory, name)
    const entry = lstatSync(entryPath)

    if (entry.isSymbolicLink()) {
      symlinks.push(entryPath)
    } else if (entry.isDirectory()) {
      symlinks.push(...findSymlinks(entryPath))
    }
  }

  return symlinks
}

/**
 * Restore valid, in-bundle Git command symlinks after Electron Packager has
 * dereferenced them while copying the application. Invalid or external links
 * are deliberately left dereferenced so they cannot break macOS signing.
 */
export function restoreGitCoreSymlinks(
  sourceAppDirectory: string,
  packagedAppDirectory: string
): number {
  const sourceGitDirectory = resolve(sourceAppDirectory, 'git')
  const sourceGitCoreDirectory = join(
    sourceGitDirectory,
    'libexec',
    'git-core'
  )
  const packagedGitDirectory = resolve(packagedAppDirectory, 'git')
  const packagedGitCoreDirectory = join(
    packagedGitDirectory,
    'libexec',
    'git-core'
  )

  if (
    !existsSync(sourceGitCoreDirectory) ||
    !existsSync(packagedGitCoreDirectory)
  ) {
    throw new Error(
      'Unable to restore Git core symlinks: the source or packaged git-core directory is missing.'
    )
  }

  let restored = 0

  for (const sourceLink of findSymlinks(sourceGitCoreDirectory)) {
    const target = readlinkSync(sourceLink)

    // Absolute links can refer to paths outside the application bundle.
    if (isAbsolute(target)) {
      continue
    }

    const sourceTarget = resolve(dirname(sourceLink), target)
    if (
      !isWithinDirectory(sourceGitDirectory, sourceTarget) ||
      !existsSync(sourceTarget)
    ) {
      continue
    }

    const packagedLink = join(
      packagedGitCoreDirectory,
      relative(sourceGitCoreDirectory, sourceLink)
    )
    const packagedTarget = resolve(dirname(packagedLink), target)

    // Only recreate a link if its target was copied into the packaged bundle.
    if (
      !isWithinDirectory(packagedGitDirectory, packagedTarget) ||
      !existsSync(packagedTarget)
    ) {
      continue
    }

    rmSync(packagedLink, { force: true, recursive: true })
    symlinkSync(target, packagedLink)
    restored += 1
  }

  return restored
}
