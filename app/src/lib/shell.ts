/* tslint:disable:no-sync-functions */

import * as ChildProcess from 'child_process'
import * as os from 'os'

const environmentVariablesToPreserve = new Set()

type IndexLookup = {
  [propName: string]: string;
}

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
  return __DARWIN__ && !process.env.PWD
}

type ShellResult = {
  stdout: string,
  error: Error | null,
}

/**
 * Gets a dump of the user's configured shell environment.
 *
 * @returns the output of the `env` command or `null` if there was an error.
 */
async function getRawShellEnv(): Promise<string | null> {
  const shell = getUserShell()

  const promise = new Promise<ShellResult>((resolve) => {
    let child: ChildProcess.ChildProcess | null = null
    let error: Error | null = null
    let stdout = ''
    let done = false

    // ensure we clean up eventually, in case things go bad
    const cleanup = () => {
      if (!done && child) {
        child.kill()
        done = true
      }
    }
    process.once('exit', cleanup)
    setTimeout(() => {
      cleanup()
    }, 5000)

    const options =  { detached: true, stdio: [ 'ignore', 'pipe', process.stderr ] }

    child = ChildProcess.spawn(shell, [ '-ilc', 'command env' ], options)

    const buffers: Array<Buffer> = []

    child.on('error', (e: Error) => {
      done = true
      error = e
    })

    child.stdout.on('data', (data: Buffer) => {
      buffers.push(data)
    })

    child.on('close', (code: number, signal) => {
      done = true
      process.removeListener('exit', cleanup)
      if (buffers.length) {
        stdout = Buffer.concat(buffers).toString('utf8')
      }

      resolve({ stdout, error })
    })
  })

  const { stdout, error }  = await promise

  if (error) {
     // just swallow the error and move on with everything
     return null
  }

  return stdout
}

function getUserShell() {
  if (process.env.SHELL) {
    return process.env.SHELL
  }

  return '/bin/bash'
}

/**
 * Get the environment variables from the user's current shell and update the
 * current environment.
 *
 * @param updateEnvironment a callback to fire if a valid environment is found
 */
export async function getEnvironmentFromShell(updateEnvironment: (env: IndexLookup) => void): Promise<void> {
  if (__WIN32__) {
    return
  }

  const shellEnvText = await getRawShellEnv()
  if (!shellEnvText) {
    return
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

  updateEnvironment(env)
}

/**
 * Apply new environment variables to the current process, ignoring
 * Node-specific environment variables which need to be preserved.
 *
 * @param env The new environment variables from the user's shell.
 */
export function mergeEnvironmentVariables(env: IndexLookup) {
  for (const key in process.env) {
    if (!environmentVariablesToPreserve.has(key)) {
      delete process.env[key]
    }
  }

  for (const key in env) {
    if (!environmentVariablesToPreserve.has(key)) {
      process.env[key] = env[key]
    }
  }
}
