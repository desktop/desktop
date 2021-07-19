import { join } from 'path'
import { pathExists as pathExistsInternal } from 'fs-extra'
import {
  ChildProcess,
  spawn,
  SpawnOptionsWithoutStdio,
  SpawnOptions,
} from 'child_process'

export function isFlatpakBuild() {
  return __LINUX__ && process.env.FLATPAK_HOST === '1'
}

/**
 * Convert an executable path to be relative to the flatpak host
 *
 * @param path a path to an executable relative to the root of the filesystem
 *
 */
export function convertToFlatpakPath(path: string) {
  if (!__LINUX__) {
    return path
  }

  if (path.startsWith('/opt/')) {
    return path
  }

  return join('/var/run/host', path)
}
export function formatWorkingDirectoryForFlatpak(path: string): string {
  return path.replace(/(\s)/, ' ')
}
/**
 * Checks the file path on disk exists before attempting to launch a specific shell
 *
 * @param path
 *
 * @returns `true` if the path can be resolved, or `false` otherwise
 */
export async function pathExists(path: string): Promise<boolean> {
  if (isFlatpakBuild()) {
    path = convertToFlatpakPath(path)
  }

  try {
    return await pathExistsInternal(path)
  } catch {
    return false
  }
}

/**
 * Spawn a particular shell in a way that works for Flatpak-based usage
 *
 * @param path path to shell, relative to the root of the filesystem
 * @param args arguments to provide to the shell
 * @param options additional options to provide to spawn function
 *
 * @returns a child process to observe and monitor
 */
export function spawnShell(
  path: string,
  args: string[],
  options?: SpawnOptionsWithoutStdio
): ChildProcess {
  if (isFlatpakBuild()) {
    return spawn('flatpak-spawn', ['--host', path, ...args], options)
  }

  return spawn(path, args, options)
}

/**
 * Spawn a given editor in a way that works for Flatpak-based usage
 *
 * @param path path to editor, relative to the root of the filesystem
 * @param workingDirectory working directory to open initially in editor
 * @param options additional options to provide to spawn function
 */
export function spawnEditor(
  path: string,
  workingDirectory: string,
  options: SpawnOptions
): ChildProcess {
  if (isFlatpakBuild()) {
    const EscapedworkingDirectory = formatWorkingDirectoryForFlatpak(
      workingDirectory
    )
    return spawn(
      'flatpak-spawn',
      ['--host', path, EscapedworkingDirectory],
      options
    )
  } else {
    return spawn(path, [workingDirectory], options)
  }
}
