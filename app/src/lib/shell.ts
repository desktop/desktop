/* eslint-disable no-sync */

import { ExecFileOptions } from 'child_process'
import { execFile } from './exec-file'
import { isMacOSCatalinaOrEarlier } from './get-os'

/**
 * The names of any env vars that we shouldn't copy from the shell environment.
 */
const ExcludedEnvironmentVars = new Set(['LOCAL_GIT_DIRECTORY'])

/**
 * Inspect whether the current process needs to be patched to get important
 * environment variables for Desktop to work and integrate with other tools
 * the user may invoke as part of their workflow.
 *
 * This is only applied to macOS installations due to how the application
 * is launched.
 *
 * @param process The process to inspect.
 */
export function shellNeedsPatching(process: NodeJS.Process): boolean {
  // We don't want to run this in the main process until the following issues
  // are closed (and possibly not after they're closed either)
  //
  // See https://github.com/desktop/desktop/issues/13974
  // See https://github.com/electron/electron/issues/32718
  if (process.type === 'browser' && isMacOSCatalinaOrEarlier()) {
    return false
  }

  return __DARWIN__ && !process.env.PWD
}

/**
 * Update the current process's environment variables using environment
 * variables from the user's shell, if they can be retrieved successfully.
 */
export async function updateEnvironmentForProcess(): Promise<void> {
  if (!__DARWIN__) {
    return
  }

  const shell = process.env.SHELL || '/bin/bash'
  // This timeout and the excessive maxBuffer are leftovers of previous
  // implementations and could _probably_ be removed. The default maxBuffer is
  // 1Mb and I don't know why anyone would have 1Mb of env vars. The timeout
  // is a leftover from when the process was detached and the reason we still
  // have it is that if we happen to await this method it could block app launch
  const opts: ExecFileOptions = { timeout: 5000, maxBuffer: 10 * 1024 * 1024 }

  const rawEnv = await execFile(shell, ['-ilc', 'command env'], opts)
    .then(({ stdout }) => stdout)
    .catch(() => '')

  for (const [, k, v] of rawEnv.matchAll(/^(.+?)=(.*)$/gm)) {
    if (!ExcludedEnvironmentVars.has(k)) {
      process.env[k] = v
    }
  }
}
