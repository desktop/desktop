import { trampolineServer } from './trampoline-server'
import { withTrampolineToken } from './trampoline-tokens'
import * as Path from 'path'
import { getDesktopTrampolineFilename } from 'desktop-trampoline'
import { TrampolineCommandIdentifier } from '../trampoline/trampoline-command'
import { getSSHEnvironment } from '../ssh/ssh'
import {
  removePendingSSHSecretToStore,
  storePendingSSHSecret,
} from '../ssh/ssh-secret-storage'
import { GitError as DugiteError, GitProcess } from 'dugite'
import memoizeOne from 'memoize-one'
import { enableCustomGitUserAgent } from '../feature-flag'
import { GitError } from '../git/core'
import { deleteGenericCredential } from '../generic-git-auth'

const mostRecentGenericGitCredential = new Map<
  string,
  { endpoint: string; login: string }
>()

export const setMostRecentGenericGitCredential = (
  trampolineToken: string,
  endpoint: string,
  login: string
) => mostRecentGenericGitCredential.set(trampolineToken, { endpoint, login })

const hasRejectedCredentialsForEndpoint = new Map<string, Set<string>>()

export const setHasRejectedCredentialsForEndpoint = (
  trampolineToken: string,
  endpoint: string
) => {
  const set = hasRejectedCredentialsForEndpoint.get(trampolineToken)
  if (set) {
    set.add(endpoint)
  } else {
    hasRejectedCredentialsForEndpoint.set(trampolineToken, new Set([endpoint]))
  }
}

export const getHasRejectedCredentialsForEndpoint = (
  trampolineToken: string,
  endpoint: string
) => {
  return (
    hasRejectedCredentialsForEndpoint.get(trampolineToken)?.has(endpoint) ??
    false
  )
}
const isBackgroundTaskEnvironment = new Map<string, boolean>()

export const getIsBackgroundTaskEnvironment = (trampolineToken: string) =>
  isBackgroundTaskEnvironment.get(trampolineToken) ?? false

export const GitUserAgent = memoizeOne(() =>
  // Can't use git() as that will call withTrampolineEnv which calls this method
  GitProcess.exec(['--version'], process.cwd())
    // https://github.com/git/git/blob/a9e066fa63149291a55f383cfa113d8bdbdaa6b3/help.c#L733-L739
    .then(r => /git version (.*)/.exec(r.stdout)?.at(1))
    .catch(e => {
      log.warn(`Could not get git version information`, e)
      return 'unknown'
    })
    .then(v => {
      const suffix = __DEV__ ? `-${__SHA__.substring(0, 10)}` : ''
      const ghdVersion = `GitHub Desktop/${__APP_VERSION__}${suffix}`
      const { platform, arch } = process

      return `git/${v} (${ghdVersion}; ${platform} ${arch})`
    })
)

/**
 * Allows invoking a function with a set of environment variables to use when
 * invoking a Git subcommand that needs to use the trampoline (mainly git
 * operations requiring an askpass script) and with a token to use in the
 * trampoline server.
 * It will handle saving SSH key passphrases when needed if the git operation
 * succeeds.
 *
 * @param fn        Function to invoke with all the necessary environment
 *                  variables.
 */
export async function withTrampolineEnv<T>(
  fn: (env: object) => Promise<T>,
  isBackgroundTask = false
): Promise<T> {
  const sshEnv = await getSSHEnvironment()

  return withTrampolineToken(async token => {
    isBackgroundTaskEnvironment.set(token, isBackgroundTask)

    // The code below assumes a few things in order to manage SSH key passphrases
    // correctly:
    // 1. `withTrampolineEnv` is only used in the functions `git` (core.ts) and
    //    `spawnAndComplete` (spawn.ts)
    // 2. Those two functions always thrown an error when something went wrong,
    //    and just return a result when everything went fine.
    //
    // With those two premises in mind, we can safely assume that right after
    // `fn` has been invoked, we can store the SSH key passphrase for this git
    // operation if there was one pending to be stored.
    try {
      const result = await fn({
        DESKTOP_PORT: await trampolineServer.getPort(),
        DESKTOP_TRAMPOLINE_TOKEN: token,
        GIT_ASKPASS: getDesktopTrampolinePath(),
        DESKTOP_TRAMPOLINE_IDENTIFIER: TrampolineCommandIdentifier.AskPass,
        ...(enableCustomGitUserAgent()
          ? { GIT_USER_AGENT: await GitUserAgent() }
          : {}),

        ...sshEnv,
      })

      await storePendingSSHSecret(token)

      return result
    } catch (e) {
      // If the operation fails with an HTTPSAuthenticationFailed error, we
      // assume that it's because the last credential we provided via the
      // askpass handler was rejected. That's not necessarily the case but for
      // practical purposes, it's as good as we can get with the information we
      // have. We're limited by the ASKPASS flow here.
      if (isAuthFailure(e) && !getIsBackgroundTaskEnvironment(token)) {
        deleteMostRecentGenericCredential(token)
      }
      throw e
    } finally {
      removePendingSSHSecretToStore(token)
      isBackgroundTaskEnvironment.delete(token)
    }
  })
}

const isAuthFailure = (e: unknown): e is GitError =>
  e instanceof GitError &&
  e.result.gitError === DugiteError.HTTPSAuthenticationFailed

function deleteMostRecentGenericCredential(token: string) {
  const cred = mostRecentGenericGitCredential.get(token)
  if (cred) {
    const { endpoint, login } = cred
    log.info(`askPassHandler: auth failed, deleting ${endpoint} credential`)
    deleteGenericCredential(endpoint, login)
  }
}

/** Returns the path of the desktop-trampoline binary. */
export function getDesktopTrampolinePath(): string {
  return Path.resolve(
    __dirname,
    'desktop-trampoline',
    getDesktopTrampolineFilename()
  )
}

/** Returns the path of the ssh-wrapper binary. */
export function getSSHWrapperPath(): string {
  return Path.resolve(__dirname, 'desktop-trampoline', 'ssh-wrapper')
}
