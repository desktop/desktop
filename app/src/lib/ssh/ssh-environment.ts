import * as Path from 'path'

import { isExecutableOnPath } from '../find-executable'
import { getPathSegments } from '../process/win32'

export async function getSSHEnvironment(executable: string) {
  const found = await isExecutableOnPath(executable)

  if (found) {
    // no need to setup our own environment, inherit the default
    return process.env
  }

  if (!__WIN32__) {
    log.warn('appending the path is currently Windows-specific code for now')
    log.warn(
      `skipping this work because I'm not sure how many users are actually affected by this`
    )
    return process.env
  }

  const paths = await getPathSegments()
  const localGitDir = process.env['LOCAL_GIT_DIRECTORY']

  if (localGitDir == null) {
    log.warn('unable to find path to the embedded Git installation')
    return process.env
  }
  const updatedPaths = [...paths, Path.join(localGitDir, 'usr', 'bin')]
  const path = updatedPaths.join(';')

  const newEnvironment = Object.assign({}, process.env, { path })

  if (newEnvironment.Path != null) {
    // this is a stupid win32 hack because `Path` and `path` are distinct keys
    // on a Javascript hash, but Windows will choose Path and ignore the other value
    delete newEnvironment.Path
  }

  return newEnvironment
}
