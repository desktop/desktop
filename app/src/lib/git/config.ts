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
  return getConfigValueInPath(name, null, env)
}

/** Set the local config value by name. */
export async function setGlobalConfigValue(
  name: string,
  value: string,
  env?: {
    HOME: string
  }
): Promise<void> {
  const options = env ? { env } : undefined

  await git(
    ['config', '--global', '--replace-all', name, value],
    __dirname,
    'setGlobalConfigValue',
    options
  )
}

async function getConfigValueInPath(
  name: string,
  path: string | null,
  env?: {
    HOME: string
  }
): Promise<string | null> {
  const flags = ['config', '-z']
  if (!path) {
    flags.push('--global')
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

export interface IMergeTool {
  /** The name of the configured merge tool. */
  readonly name: string

  /** The command to run for the merge tool. */
  readonly command: string | null
}

/** Get the configured merge tool. */
export async function getMergeTool(): Promise<IMergeTool | null> {
  const name = await getGlobalConfigValue('merge.tool')
  if (name) {
    const command = await getGlobalConfigValue(`mergetool.${name}.cmd`)
    return { name, command }
  } else {
    return null
  }
}
