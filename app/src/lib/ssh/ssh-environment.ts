import * as Path from 'path'
import { enumerateValues, HKEY, RegistryValueType } from 'registry-js'
import { pathExists } from 'fs-extra'

import { findExecutableOnPath } from '../find-executable'
import { getPathSegments } from '../process/win32'

async function findGitForWindowsInstall(): Promise<string | null> {
  const registryPath = enumerateValues(
    HKEY.HKEY_LOCAL_MACHINE,
    'SOFTWARE\\GitForWindows'
  )

  if (registryPath.length === 0) {
    return null
  }

  const installPathEntry = registryPath.find(e => e.name === 'InstallPath')
  if (installPathEntry && installPathEntry.type === RegistryValueType.REG_SZ) {
    const path = Path.join(installPathEntry.data, 'git-bash.exe')

    if (await pathExists(path)) {
      return installPathEntry.data
    } else {
      log.debug(
        `[hasGitForWindowsInstall] registry entry found but git-bash.exe does not exist at '${path}'`
      )
    }
  }

  return null
}

async function appendToPath(directory: string) {
  const paths = await getPathSegments()
  const updatedPaths = [...paths, directory]
  const path = updatedPaths.join(';')

  const env = Object.assign({}, process.env, { path })

  if (env.Path != null) {
    // this is a stupid win32 hack because `Path` and `path` are distinct keys
    // on a Javascript hash, but Windows will choose Path and ignore the other value
    delete env.Path
  }

  return env
}

export async function getSSHEnvironment(executable: string) {
  // don't even bother checking for macOS as it should be there by default
  if (__DARWIN__) {
    return process.env
  }

  const path = await findExecutableOnPath(executable)
  if (path != null) {
    log.debug(
      `[getSSHEnvironment] found ${executable} on PATH, no need to tweak the environment`
    )
    return process.env
  }

  if (__LINUX__) {
    log.warn(
      '[getSSHEnvironment] TODO: what should we be doing for the Linux support?'
    )
    return process.env
  }

  const foundGitInstall = await findGitForWindowsInstall()
  if (foundGitInstall != null) {
    const pathToSSHTools = Path.join(foundGitInstall, 'usr', 'bin')
    return appendToPath(pathToSSHTools)
  }

  const localGitDir = process.env['LOCAL_GIT_DIRECTORY']
  if (localGitDir != null) {
    const pathToSSHTools = Path.join(localGitDir, 'usr', 'bin')
    return appendToPath(pathToSSHTools)
  }

  log.warn(
    '[getSSHEnvironment] unable to find path to the embedded Git installation'
  )
  return process.env
}
