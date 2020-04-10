import { git } from './core'
import { Repository } from '../../models/repository'
import { normalize } from 'path'

/** Look up a config value by name in the repository. */
export function getConfigValue(
  repository: Repository,
  name: string
): Promise<string | null> {
  return getConfigValueInPath(name, repository.path)
}

/** Look up a global config value by name. */
export function getGlobalConfigValue(
  name: string,
  env?: {
    HOME: string
  }
): Promise<string | null> {
  return getConfigValueInPath(name, null, undefined, env)
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
  const value = await getConfigValueInPath(name, null, 'bool', env)
  return value === null ? null : value !== 'false'
}

/**
 * Look up a config value by name
 *
 * @param path The path to execute the `git` command in. If null
 *             we'll use the global configuration (i.e. --global)
 *             and execute the Git call from the same location that
 *             GitHub Desktop is installed in.
 * @param type Canonicalize configuration values according to the
 *             expected type (i.e. 0 -> false, "on" -> true etc).
 *             See `--type` documentation in `git config`
 */
async function getConfigValueInPath(
  name: string,
  path: string | null,
  type?: 'bool' | 'int' | 'bool-or-int' | 'path' | 'expiry-date' | 'color',
  env?: {
    HOME: string
  }
): Promise<string | null> {
  const flags = ['config', '-z']
  if (!path) {
    flags.push('--global')
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

/** Set the global config value by name. */
export async function setGlobalConfigValue(
  name: string,
  value: string,
  env?: {
    HOME: string
  }
): Promise<void> {
  setConfigValueInPath(name, value, null, env)
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

  const flags = [
    'config',
    ...(!path ? ['--global'] : []),
    '--replace-all',
    name,
    value,
  ]

  await git(flags, __dirname, 'setConfigValueInPath', options)
}
