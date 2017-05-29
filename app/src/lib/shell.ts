/* tslint:disable:no-sync-functions */

import { spawnSync } from 'child_process'
import * as os from 'os'

type IndexLookup = {
  [propName: string]: string;
}

/**
 * Inspect whether the current process is being launched from the macOS tray,
 * and requires rehydrating of the shell environment variables.
 *
 * @param process The current process to inspect.
 */
export function shellNeedsPatching(process: NodeJS.Process): boolean {
  if (__DARWIN__ && !process.env.PWD) {
    const shell = getUserShell()
    if (shell.endsWith('csh') || shell.endsWith('tcsh')) {
      return false
    }
    return true
  }

  return false
}

/**
 * Gets a dump of the user's configured shell environment.
 *
 * @returns the output of the `env` command or `null` if there was an error.
 */
function getRawShellEnv(): string | null {
  const shell = getUserShell()

  // The `-ilc` set of options was tested to work with the OS X v10.11
  // default-installed versions of bash, zsh, sh, and ksh. It *does not*
  // work with csh or tcsh.
  const results = spawnSync(shell, [ '-ilc', 'env' ], { encoding: 'utf8' })
  if (results.error || !results.stdout || results.stdout.length <= 0) {
    return null
  }

  return results.stdout
}

function getUserShell() {
  if (process.env.SHELL) {
    return process.env.SHELL
  }

  return '/bin/bash'
}

/**
 * Get the environment variables to rehydrate the process.
 *
 * @returns a set of key-value pairs representing the environment variables
 * that a user has defined, or `null` if unable to resolve them.
 */
export function getEnvironmentFromShell(): IndexLookup | null  {
  const shellEnvText = getRawShellEnv()
  if (!shellEnvText) {
    return null
  }

  const env: IndexLookup = { }

  for (const line of shellEnvText.split(os.EOL)) {
    if (line.includes('=')) {
      const components = line.split('=')
       if (components.length === 2) {
         env[components[0]] = components[1]
       } else {
         const k = components.shift()
         const v = components.join('=')
         if (k) {
          env[k] = v
         }
       }
     }
   }

  return env
}
