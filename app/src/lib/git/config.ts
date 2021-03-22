import { git } from './core'
import { Repository } from '../../models/repository'
import { normalize } from 'path'

/**
 * Look up a config value by name in the repository.
 *
 * @param onlyLocal Whether or not the value to be retrieved should stick to
 *                  the local repository settings. It is false by default. This
 *                  is equivalent to using the `--local` argument in the
 *                  `git config` invocation.
 */
export function getConfigValue(
  repository: Repository,
  name: string,
  onlyLocal: boolean = false
): Promise<string | null> {
  return getConfigValueInPath(name, repository.path, onlyLocal)
}

/** Look up a global config value by name. */
export function getGlobalConfigValue(
  name: string,
  env?: {
    HOME: string
  }
): Promise<string | null> {
  return getConfigValueInPath(name, null, false, undefined, env)
}

/**
 * Look up a global config value by name.
 *
 * Treats the returned value as a boolean as per Git's
 * own definition of a boolean configuration value (i.e.
 * 0 -> false, "off" -> false, "yes" -> true etc)
 */
export async function getGlobalBooleanConfigValue(
  name: string,
  env?: {
    HOME: string
  }
): Promise<boolean | null> {
  const value = await getConfigValueInPath(name, null, false, 'bool', env)
  return value === null ? null : value !== 'false'
}

/**
 * Look up a config value by name
 *
 * @param path      The path to execute the `git` command in. If null
 *                  we'll use the global configuration (i.e. --global)
 *                  and execute the Git call from the same location that
 *                  GitHub Desktop is installed in.
 * @param onlyLocal Whether or not the value to be retrieved should stick to
 *                  the local repository settings (if a path is specified). It
 *                  is false by default. It is equivalent to using the `--local`
 *                  argument in the `git config` invocation.
 * @param type      Canonicalize configuration values according to the
 *                  expected type (i.e. 0 -> false, "on" -> true etc).
 *                  See `--type` documentation in `git config`
 */
async function getConfigValueInPath(
  name: string,
  path: string | null,
  onlyLocal: boolean = false,
  type?: 'bool' | 'int' | 'bool-or-int' | 'path' | 'expiry-date' | 'color',
  env?: {
    HOME: string
  }
): Promise<string | null> {
  const flags = ['config', '-z']
  if (!path) {
    flags.push('--global')
  } else if (onlyLocal) {
    flags.push('--local')
  }

  if (type !== undefined) {
    flags.push('--type', type)
  }

  flags.push(name)

  const result = await git(flags, path || __dirname, 'getConfigValueInPath', {
    successExitCodes: new Set([0, 1]),
    env,
  })

  // Git exits with 1 if the value isn't found. That's OK.
  if (result.exitCode === 1) {
    return null
  }

  const output = result.stdout
  const pieces = output.split('\0')
  return pieces[0]
}

/** Get the path to the global git config. */
export async function getGlobalConfigPath(env?: {
  HOME: string
}): Promise<string | null> {
  const options = env ? { env } : undefined
  const result = await git(
    ['config', '--global', '--list', '--show-origin', '--name-only', '-z'],
    __dirname,
    'getGlobalConfigPath',
    options
  )
  const segments = result.stdout.split('\0')
  if (segments.length < 1) {
    return null
  }

  const pathSegment = segments[0]
  if (!pathSegment.length) {
    return null
  }

  const path = pathSegment.match(/file:(.+)/i)
  if (!path || path.length < 2) {
    return null
  }

  return normalize(path[1])
}

/** Set the local config value by name. */
export async function setConfigValue(
  repository: Repository,
  name: string,
  value: string,
  env?: {
    HOME: string
  }
): Promise<void> {
  return setConfigValueInPath(name, value, repository.path, env)
}

/** Set the global config value by name. */
export async function setGlobalConfigValue(
  name: string,
  value: string,
  env?: {
    HOME: string
  }
): Promise<void> {
  return setConfigValueInPath(name, value, null, env)
}

/**
 * Set config value by name
 *
 * @param path The path to execute the `git` command in. If null
 *             we'll use the global configuration (i.e. --global)
 *             and execute the Git call from the same location that
 *             GitHub Desktop is installed in.
 */
async function setConfigValueInPath(
  name: string,
  value: string,
  path: string | null,
  env?: {
    HOME: string
  }
): Promise<void> {
  const options = env ? { env } : undefined

  const flags = ['config']

  if (!path) {
    flags.push('--global')
  }

  flags.push('--replace-all', name, value)

  await git(flags, path || __dirname, 'setConfigValueInPath', options)
}

/** Remove the local config value by name. */
export async function removeConfigValue(
  repository: Repository,
  name: string,
  env?: {
    HOME: string
  }
): Promise<void> {
  return removeConfigValueInPath(name, repository.path, env)
}

/** Remove the global config value by name. */
export async function removeGlobalConfigValue(
  name: string,
  env?: {
    HOME: string
  }
): Promise<void> {
  return removeConfigValueInPath(name, null, env)
}

/**
 * Remove config value by name
 *
 * @param path The path to execute the `git` command in. If null
 *             we'll use the global configuration (i.e. --global)
 *             and execute the Git call from the same location that
 *             GitHub Desktop is installed in.
 */
async function removeConfigValueInPath(
  name: string,
  path: string | null,
  env?: {
    HOME: string
  }
): Promise<void> {
  const options = env ? { env } : undefined

  const flags = ['config']

  if (!path) {
    flags.push('--global')
  }

  flags.push('--unset-all', name)

  await git(flags, path || __dirname, 'removeConfigValueInPath', options)
}
