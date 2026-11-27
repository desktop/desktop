import {
  existsSync,
  lstatSync,
  readlinkSync,
  readdirSync,
  realpathSync,
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

  const sourceGitRealDirectory = realpathSync(sourceGitDirectory)
  const packagedGitRealDirectory = realpathSync(packagedGitDirectory)
  let restored = 0

  for (const sourceLink of findSymlinks(sourceGitCoreDirectory)) {
    const target = readlinkSync(sourceLink)

    // Absolute links can refer to paths outside the application bundle.
    if (isAbsolute(target)) {
      continue
    }

    // Resolve the link through the filesystem before checking containment.
    // Lexically collapsing ".." first is unsafe when an earlier component is
    // itself a symlink (for example, "redirect/../git-bin").
    let sourceTarget: string
    try {
      sourceTarget = realpathSync(sourceLink)
    } catch {
      // Broken or otherwise unresolvable source links must remain dereferenced.
      continue
    }

    if (!isWithinDirectory(sourceGitRealDirectory, sourceTarget)) {
      continue
    }

    const packagedLink = join(
      packagedGitCoreDirectory,
      relative(sourceGitCoreDirectory, sourceLink)
    )
    const packagedCandidate = resolve(dirname(packagedLink), target)
    const expectedPackagedTarget = resolve(
      packagedGitRealDirectory,
      relative(sourceGitRealDirectory, sourceTarget)
    )

    // Packager may have dereferenced intermediate links. Recreate the link
    // only when the original target string still resolves to the mirrored
    // target inside the packaged Git directory.
    let packagedTarget: string
    try {
      packagedTarget = realpathSync(packagedCandidate)
    } catch {
      continue
    }

    if (
      !isWithinDirectory(packagedGitRealDirectory, packagedTarget) ||
      packagedTarget !== expectedPackagedTarget
    ) {
      continue
    }

    rmSync(packagedLink, { force: true, recursive: true })
    symlinkSync(target, packagedLink)
    restored += 1
  }

  return restored
}
