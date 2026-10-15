import { AccountsStore, RepositoriesStore } from '../stores'
import { Account } from '../../models/account'
import { Repository } from '../../models/repository'
import { getAccountForRepository } from '../get-account-for-repository'
import { matchExistingRepository } from '../repository-matching'
import { TrampolineCommandHandler } from './trampoline-command'
import { forceUnwrap } from '../fatal-error'
import {
  approveCredential,
  fillCredential,
  formatCredential,
  parseCredential,
  rejectCredential,
} from '../git/credential'
import {
  getCredentialUrl,
  getIsBackgroundTaskEnvironment,
  getTrampolineEnvironmentPath,
  getTrampolineFallbackAccount,
  holdCredentialLease,
  setHasRejectedCredentialsForEndpoint,
} from './trampoline-environment'
import { useExternalCredentialHelper } from './use-external-credential-helper'
import {
  findGenericTrampolineAccount,
  findGitHubTrampolineAccount,
} from './find-account'
import { IGitAccount } from '../../models/git-account'
import {
  deleteGenericCredential,
  setGenericCredential,
} from '../generic-git-auth'
import { urlWithoutCredentials } from './url-without-credentials'
import { trampolineUIHelper as ui } from './trampoline-ui-helper'
import { getHTMLURL, isGitHubHost } from '../api'
import { isDotCom, isGHE, isGist } from '../endpoint-capabilities'
import { AccountRequiresSignInError } from '../credential-sessions'

type Credential = Map<string, string>
type Store = Pick<AccountsStore, 'getAll' | 'leaseAccountToken'>

const info = (msg: string) => log.info(`credential-helper: ${msg}`)
const debug = (msg: string) => log.debug(`credential-helper: ${msg}`)
const error = (msg: string, e: any) => log.error(`credential-helper: ${msg}`, e)

/**
 * Merges credential info from account into credential
 *
 * When looking up a first-party account (GitHub.com et al) we can use the
 * account's endpoint host in the credential since that's the API url so instead
 * we take all the fields from the credential and set the username and password
 * from the Account on top of those.
 */
const credWithAccount = (c: Credential, a: IGitAccount | undefined) =>
  a && new Map(c).set('username', a.login).set('password', a.token)

/**
 * Lease a fresh token for a signed-in account until the Git process exits.
 *
 * Git LFS asks again under its parent Git's trampoline token, so it gets the
 * token that process holds instead of waiting for it. Returns undefined if the
 * account must sign in again.
 */
async function getLeasedCredential(
  cred: Credential,
  store: Store,
  token: string,
  account: Account
) {
  try {
    const lease = await store.leaseAccountToken(account, token)
    holdCredentialLease(token, lease.release)
    return credWithAccount(cred, lease.account)
  } catch (e) {
    if (!(e instanceof AccountRequiresSignInError)) {
      throw e
    }
    info(`GitHub credential for ${getCredentialUrl(cred)} requires sign in`)
    return undefined
  }
}

async function promptForCredential(cred: Credential, endpoint: string) {
  const parsedUrl = new URL(endpoint)
  const username = parsedUrl.username === '' ? undefined : parsedUrl.username
  const account = await ui.promptForGenericGitAuthentication(endpoint, username)
  info(`prompt for ${endpoint}: ${account ? 'completed' : 'cancelled'}`)
  return credWithAccount(cred, account)
}

async function getGenericCredential(cred: Credential, token: string) {
  const endpoint = `${getCredentialUrl(cred)}`
  const account = await findGenericTrampolineAccount(token, endpoint)

  if (account) {
    info(`found generic credential for ${endpoint}`)
    return credWithAccount(cred, account)
  }

  if (getIsBackgroundTaskEnvironment(token)) {
    debug('background task environment, skipping prompt')
    return undefined
  } else {
    return promptForCredential(cred, endpoint)
  }
}

async function getExternalCredential(input: Credential, token: string) {
  const path = getTrampolineEnvironmentPath(token)
  const cred = await fillCredential(input, path, getGcmEnv(token))
  if (cred) {
    info(`found credential for ${getCredentialUrl(cred)} in external helper`)
  }
  return cred
}

/** Implementation of the 'get' git credential helper command */
/** Whether the URL has the same origin as the endpoint's web URL. */
function isSameOrigin(url: URL, endpoint: string) {
  return new URL(getHTMLURL(endpoint)).origin === url.origin
}

async function getCredential(
  cred: Credential,
  store: Store,
  token: string,
  repositories: ReadonlyArray<Repository>
) {
  const credentialUrl = getCredentialUrl(cred)
  const endpoint = `${credentialUrl}`
  const repository = matchExistingRepository(
    repositories,
    getTrampolineEnvironmentPath(token)
  )
  // Require the request to target the account endpoint's exact origin
  // (scheme, host, and port). Otherwise a token could be sent over plain HTTP
  // or to another service on the same host.
  const repositoryEndpoint = repository?.gitHubRepository?.endpoint
  if (
    repository !== undefined &&
    repositoryEndpoint !== undefined &&
    isSameOrigin(credentialUrl, repositoryEndpoint)
  ) {
    const account =
      getAccountForRepository(await store.getAll(), repository) ??
      (getIsBackgroundTaskEnvironment(token)
        ? undefined
        : await ui.promptForRepositoryAccount(repository))
    return account?.endpoint === repositoryEndpoint
      ? getLeasedCredential(cred, store, token, account)
      : undefined
  }

  const fallbackAccount = getTrampolineFallbackAccount(token)
  if (
    fallbackAccount !== undefined &&
    isSameOrigin(credentialUrl, fallbackAccount.endpoint)
  ) {
    // Only signed-in accounts can be used, with their current token.
    const account = (await store.getAll()).find(
      a =>
        a.endpoint === fallbackAccount.endpoint &&
        a.login.toLowerCase() === fallbackAccount.login.toLowerCase()
    )
    return account === undefined
      ? undefined
      : getLeasedCredential(cred, store, token, account)
  }

  // Never lend a repository's credentials to a different GitHub endpoint
  // (for example a submodule hosted on another server).
  if ((await getEndpointKind(cred, store)) !== 'generic') {
    info(`no matching account for ${endpoint}`)
    return undefined
  }

  return useExternalCredentialHelper()
    ? getExternalCredential(cred, token)
    : getGenericCredential(cred, token)
}

const getEndpointKind = async (cred: Credential, store: Store) => {
  const credentialUrl = getCredentialUrl(cred)
  const endpoint = `${credentialUrl}`

  if (isGist(endpoint)) {
    return 'generic'
  }

  if (isDotCom(endpoint)) {
    return 'github.com'
  }

  if (isGHE(endpoint)) {
    return 'ghe.com'
  }

  // When Git attempts to authenticate with a host it captures any
  // WWW-Authenticate headers and forwards them to the credential helper. We
  // use them as a happy-path to determine if the host is a GitHub host without
  // having to resort to making a request ourselves.
  for (const [k, v] of cred.entries()) {
    if (k.startsWith('wwwauth[')) {
      if (v.includes('realm="GitHub"')) {
        return 'enterprise'
      } else if (/realm="(GitLab|Gitea|Atlassian Bitbucket)"/.test(v)) {
        return 'generic'
      }
    }
  }

  const existingAccount = await findGitHubTrampolineAccount(store, endpoint)
  if (existingAccount) {
    return isDotCom(existingAccount.endpoint) ? 'github.com' : 'enterprise'
  }

  // All GitHub hosts use HTTPS, so if the protocol is not HTTPS we can
  // assume that this is not a GitHub host.
  if (credentialUrl.protocol !== 'https:') {
    return 'generic'
  }

  return (await isGitHubHost(endpoint)) ? 'enterprise' : 'generic'
}

/** Implementation of the 'store' git credential helper command */
async function storeCredential(cred: Credential, store: Store, token: string) {
  if ((await getEndpointKind(cred, store)) !== 'generic') {
    return
  }

  return useExternalCredentialHelper()
    ? storeExternalCredential(cred, token)
    : setGenericCredential(
        urlWithoutCredentials(getCredentialUrl(cred)),
        forceUnwrap(`credential missing username`, cred.get('username')),
        forceUnwrap(`credential missing password`, cred.get('password'))
      )
}

const storeExternalCredential = (cred: Credential, token: string) => {
  const path = getTrampolineEnvironmentPath(token)
  return approveCredential(cred, path, getGcmEnv(token))
}

/** Implementation of the 'erase' git credential helper command */
async function eraseCredential(cred: Credential, store: Store, token: string) {
  if ((await getEndpointKind(cred, store)) !== 'generic') {
    return
  }

  return useExternalCredentialHelper()
    ? eraseExternalCredential(cred, token)
    : deleteGenericCredential(
        urlWithoutCredentials(getCredentialUrl(cred)),
        forceUnwrap(`credential missing username`, cred.get('username'))
      )
}

const eraseExternalCredential = (cred: Credential, token: string) => {
  const path = getTrampolineEnvironmentPath(token)
  return rejectCredential(cred, path, getGcmEnv(token))
}

export function createCredentialHelperTrampolineHandler(
  accountsStore: AccountsStore,
  repositoriesStore: RepositoriesStore
): TrampolineCommandHandler {
  let accounts: ReadonlyArray<Account> = []
  let repositories: ReadonlyArray<Repository> = []
  let accountsUpdated = false
  let repositoriesUpdated = false
  accountsStore.onDidUpdate(updated => {
    accountsUpdated = true
    accounts = updated
  })
  repositoriesStore.onDidUpdate(updated => {
    repositoriesUpdated = true
    repositories = updated
  })
  const ready = Promise.all([
    accountsStore.getAll().then(initial => {
      if (!accountsUpdated) {
        accounts = initial
      }
    }),
    repositoriesStore.getAll().then(initial => {
      if (!repositoriesUpdated) {
        repositories = initial
      }
    }),
  ])
  const store: Store = {
    getAll: async () => accounts,
    leaseAccountToken: (account, holder) =>
      accountsStore.leaseAccountToken(account, holder),
  }
  return async command => {
    await ready
    const firstParameter = command.parameters.at(0)
    if (!firstParameter) {
      return undefined
    }

    const { trampolineToken: token } = command
    const input = parseCredential(command.stdin)

    if (__DEV__) {
      debug(
        `${firstParameter}\n${command.stdin
          .replaceAll(/^password=.*$/gm, 'password=***')
          .replaceAll(/^(.*)$/gm, '  $1')
          .trimEnd()}`
      )
    }

    try {
      if (firstParameter === 'get') {
        const cred = await getCredential(input, store, token, repositories)
        if (!cred) {
          const endpoint = `${getCredentialUrl(input)}`
          info(`could not find credential for ${endpoint}`)
          setHasRejectedCredentialsForEndpoint(token, endpoint)
        }
        return cred ? formatCredential(cred) : undefined
      } else if (firstParameter === 'store') {
        await storeCredential(input, store, token)
      } else if (firstParameter === 'erase') {
        await eraseCredential(input, store, token)
      }
      return undefined
    } catch (e) {
      error(`${firstParameter} failed`, e)
      return undefined
    }
  }
}

function getGcmEnv(token: string): Record<string, string | undefined> {
  const isBackgroundTask = getIsBackgroundTaskEnvironment(token)
  return {
    ...(process.env.GITHUB_DESKTOP_DISABLE_HARDWARE_ACCELERATION
      ? { GCM_GUI_SOFTWARE_RENDERING: '1' }
      : {}),
    GCM_INTERACTIVE: isBackgroundTask ? '0' : '1',
  }
}
