import { trampolineServer } from './trampoline-server'
import { withTrampolineToken } from './trampoline-tokens'
import * as Path from 'path'
import { getSSHEnvironment } from '../ssh/ssh'
import {
  deleteMostRecentSSHCredential,
  removeMostRecentSSHCredential,
} from '../ssh/ssh-credential-storage'
import { GitError as DugiteError, GitProcess } from 'dugite'
import memoizeOne from 'memoize-one'
import { enableCredentialHelperTrampoline } from '../feature-flag'
import { GitError, getDescriptionForError } from '../git/core'
import { deleteGenericCredential } from '../generic-git-auth'
import { getDesktopAskpassTrampolineFilename } from 'desktop-trampoline'

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
const trampolineEnvironmentPath = new Map<string, string>()

export const getTrampolineEnvironmentPath = (trampolineToken: string) =>
  trampolineEnvironmentPath.get(trampolineToken) ?? process.cwd()

export const getIsBackgroundTaskEnvironment = (trampolineToken: string) =>
  isBackgroundTaskEnvironment.get(trampolineToken) ?? false

export const getCredentialUrl = (cred: Map<string, string>) => {
  const u = cred.get('url')
  if (u) {
    return new URL(u)
  }

  const protocol = cred.get('protocol') ?? ''
  const username = cred.get('username')
  const user = username ? `${encodeURIComponent(username)}@` : ''
  const host = cred.get('host') ?? ''
  const path = cred.get('path') ?? ''

  return new URL(`${protocol}://${user}${host}/${path}`)
}

export const GitUserAgent = memoizeOne(() =>
  // Can't use git() as that will call withTrampolineEnv which calls this method
  GitProcess.exec(['--version'], process.cwd())
    // https://github.com/git/git/blob/a9e066fa63149291a55f383cfa113d8bdbdaa6b3/help.c#L733-L739
    .then(r => /git version (.*)/.exec(r.stdout)?.at(1) ?? 'unknown')
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

const fatalPromptsDisabledRe =
  /^fatal: could not read .*?: terminal prompts disabled\n$/

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
  path: string,
  isBackgroundTask = false,
  customEnv?: Record<string, string | undefined>
): Promise<T> {
  const sshEnv = await getSSHEnvironment()

  return withTrampolineToken(async token => {
    isBackgroundTaskEnvironment.set(token, isBackgroundTask)
    trampolineEnvironmentPath.set(token, path)

    const existingGitEnvConfig =
      customEnv?.['GIT_CONFIG_PARAMETERS'] ??
      process.env['GIT_CONFIG_PARAMETERS'] ??
      ''

    const gitEnvConfigPrefix =
      existingGitEnvConfig.length > 0 ? `${existingGitEnvConfig} ` : ''

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
      return await fn({
        DESKTOP_PORT: await trampolineServer.getPort(),
        DESKTOP_TRAMPOLINE_TOKEN: token,
        ...(enableCredentialHelperTrampoline()
          ? {
              GIT_ASKPASS: '',
              // This warrants some explanation. We're configuring the
              // credential helper using environment variables rather than
              // arguments (i.e. -c credential.helper=) because we want commands
              // invoked by filters (i.e. Git LFS) to be able to pick up our
              // configuration. Arguments passed to git commands are not passed
              // down to filters.
              //
              // We're using the undocumented GIT_CONFIG_PARAMETERS environment
              // variable over the documented GIT_CONFIG_{COUNT,KEY,VALUE} due
              // to an apparent bug either in a Windows Python runtime
              // dependency or in a Python project commonly used to manage hooks
              // which isn't able to handle the blank environment variables we
              // need when using GIT_CONFIG_*.
              //
              // See https://github.com/desktop/desktop/issues/18945
              // See https://github.com/git/git/blob/ed155187b429a/config.c#L664
              GIT_CONFIG_PARAMETERS: `${gitEnvConfigPrefix}'credential.helper=' 'credential.helper=desktop'`,
            }
          : {
              GIT_ASKPASS: getDesktopAskpassTrampolinePath(),
            }),
        GIT_USER_AGENT: await GitUserAgent(),
        ...sshEnv,
      })
    } catch (e) {
      if (!getIsBackgroundTaskEnvironment(token)) {
        // If the operation fails with an HTTPSAuthenticationFailed error, we
        // assume that it's because the last credential we provided via the
        // askpass handler was rejected. That's not necessarily the case but for
        // practical purposes, it's as good as we can get with the information we
        // have. We're limited by the ASKPASS flow here.
        // Same with SSHAuthenticationFailed error.
        if (isHTTPSAuthFailure(e)) {
          deleteMostRecentGenericCredential(token)
        } else if (isSSHAuthFailure(e)) {
          deleteMostRecentSSHCredential(token)
        }
      }

      // Prior to us introducing the credential helper trampoline, our askpass
      // trampoline would return an empty string as the username and password if
      // we were unable to find an account or acquire credentials from the user.
      // Git would take that to mean that the literal username and password were
      // an empty string and would attempt to authenticate with those. This
      // would fail and Git would then exit with an authentication error which
      // would bubble up to the user. Now that we're using the credential helper
      // Git knows that we failed to provide credentials and instead of trying
      // to authenticate with an empty string it will exit with an error saying
      // that it couldn't read the username since terminal prompts were
      // disabled.
      //
      // We catch that specific error here and throw the user-friendly
      // authentication failed error that we've always done in the past.
      if (
        enableCredentialHelperTrampoline() &&
        hasRejectedCredentialsForEndpoint.has(token) &&
        e instanceof GitError &&
        fatalPromptsDisabledRe.test(e.message)
      ) {
        const gitErrorDescription =
          getDescriptionForError(DugiteError.HTTPSAuthenticationFailed, '') ??
          'Authentication failed: user cancelled authentication'

        const fakeAuthError = new GitError(
          { ...e.result, gitErrorDescription },
          e.args
        )

        fakeAuthError.cause = e
        throw fakeAuthError
      }

      throw e
    } finally {
      removeMostRecentSSHCredential(token)
      mostRecentGenericGitCredential.delete(token)
      isBackgroundTaskEnvironment.delete(token)
      hasRejectedCredentialsForEndpoint.delete(token)
      trampolineEnvironmentPath.delete(token)
    }
  })
}

const isHTTPSAuthFailure = (e: unknown): e is GitError =>
  e instanceof GitError &&
  e.result.gitError === DugiteError.HTTPSAuthenticationFailed

const isSSHAuthFailure = (e: unknown): e is GitError =>
  e instanceof GitError &&
  (e.result.gitError === DugiteError.SSHAuthenticationFailed ||
    e.result.gitError === DugiteError.SSHPermissionDenied)

function deleteMostRecentGenericCredential(token: string) {
  const cred = mostRecentGenericGitCredential.get(token)
  if (cred) {
    const { endpoint, login } = cred
    log.info(`askPassHandler: auth failed, deleting ${endpoint} credential`)
    deleteGenericCredential(endpoint, login)
  }
}

/** Returns the path of the desktop-askpass-trampoline binary. */
export function getDesktopAskpassTrampolinePath(): string {
  return Path.resolve(
    __dirname,
    'desktop-trampoline',
    getDesktopAskpassTrampolineFilename()
  )
}

/** Returns the path of the ssh-wrapper binary. */
export function getSSHWrapperPath(): string {
  return Path.resolve(__dirname, 'desktop-trampoline', 'ssh-wrapper')
}
