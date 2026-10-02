import { AccountsStore } from '../stores'
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
  getCredentialAccountIdentity,
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
import { API, getAPIEndpoint, isGitHubHost } from '../api'
import { APIError } from '../http'
import { HttpStatusCode } from '../http-status-code'
import { isDotCom, isGHE, isGist } from '../endpoint-capabilities'
import { RepositoriesStore } from '../stores/repositories-store'
import * as Path from 'path'
import { getHTMLURL } from '../api'
import { Account, IAccountIdentity } from '../../models/account'
import { Repository } from '../../models/repository'

type Credential = Map<string, string>
type Store = AccountsStore

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

/** Resolve GitHub credentials for an existing repository without host fallback. */
export function accountForCredential(
  accounts: ReadonlyArray<Account>,
  repositories: ReadonlyArray<Repository>,
  path: string,
  remoteUrl: string,
  knownAccounts: ReadonlyArray<Account> = accounts,
  credentialAccountIdentity?: IAccountIdentity | null
): Account | undefined {
  const repository = repositories
    .filter(
      repo => path === repo.path || path.startsWith(`${repo.path}${Path.sep}`)
    )
    .sort((left, right) => right.path.length - left.path.length)[0]
  const origin = new URL(remoteUrl).origin
  const matchingAccounts = accounts.filter(
    account => new URL(getHTMLURL(account.endpoint)).origin === origin
  )
  const identity =
    credentialAccountIdentity === undefined
      ? repository?.accountIdentity
      : credentialAccountIdentity
  if (identity === null) {
    return undefined
  }
  if (identity === undefined) {
    const knownOnHost = knownAccounts.filter(
      account => new URL(getHTMLURL(account.endpoint)).origin === origin
    )
    return matchingAccounts.length === 1 && knownOnHost.length <= 1
      ? matchingAccounts[0]
      : undefined
  }

  return matchingAccounts.find(
    account =>
      account.endpoint === identity.endpoint && account.id === identity.id
  )
}

async function getGitHubCredential(
  cred: Credential,
  store: AccountsStore,
  repositoriesStore: RepositoriesStore,
  token: string
) {
  const endpoint = `${getCredentialUrl(cred)}`
  const path = getTrampolineEnvironmentPath(token)
  const [accounts, repositories, knownAccounts] = await Promise.all([
    store.getAll(),
    repositoriesStore.getAll(),
    store.getKnownAccounts(),
  ])
  const account = accountForCredential(
    accounts,
    repositories,
    path,
    endpoint,
    knownAccounts,
    getCredentialAccountIdentity(token)
  )
  if (account) {
    info(`found GitHub credential for ${endpoint} in store`)
  }
  return credWithAccount(cred, account)
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
async function getCredential(
  cred: Credential,
  store: Store,
  repositoriesStore: RepositoriesStore,
  token: string
) {
  const ghCred = await getGitHubCredential(
    cred,
    store,
    repositoriesStore,
    token
  )

  if (ghCred) {
    return ghCred
  }

  const endpointKind = await getEndpointKind(cred, store)
  const accounts = await store.getAll()

  const endpoint = `${getCredentialUrl(cred)}`
  const apiEndpoint = getAPIEndpoint(endpoint)
  const path = getTrampolineEnvironmentPath(token)
  const repository = (await repositoriesStore.getAll())
    .filter(
      repo => path === repo.path || path.startsWith(`${repo.path}${Path.sep}`)
    )
    .sort((left, right) => right.path.length - left.path.length)[0]
  const selectedIdentity = getCredentialAccountIdentity(token)
  const identity =
    selectedIdentity === undefined
      ? repository?.accountIdentity
      : selectedIdentity
  const accountsOnHost = accounts.filter(
    account => account.endpoint === apiEndpoint
  )
  const knownOnHost = (await store.getKnownAccounts()).filter(
    account => account.endpoint === apiEndpoint
  )
  if (
    endpointKind !== 'generic' &&
    selectedIdentity === undefined &&
    repository !== undefined &&
    (identity === null || (identity === undefined && knownOnHost.length > 1)) &&
    accountsOnHost.length > 0
  ) {
    if (getIsBackgroundTaskEnvironment(token)) {
      return undefined
    }
    const selected = await ui.promptForRepositoryAccount(
      repository,
      accountsOnHost
    )
    return credWithAccount(cred, selected)
  }
  const associatedAccountSignedOut =
    identity !== null &&
    identity !== undefined &&
    identity.endpoint === apiEndpoint

  // If it appears as if the endpoint is a GitHub host and we don't have an
  // account for that endpoint then we should prompt the user to sign in.
  if (
    endpointKind !== 'generic' &&
    (associatedAccountSignedOut ||
      !accounts.some(a => a.endpoint === apiEndpoint))
  ) {
    if (getIsBackgroundTaskEnvironment(token)) {
      debug('background task environment, skipping prompt')
      return undefined
    }

    const account = await ui.promptForGitHubSignIn(endpoint)

    if (
      account === undefined ||
      (associatedAccountSignedOut &&
        (account.endpoint !== identity.endpoint || account.id !== identity.id))
    ) {
      if (account !== undefined) {
        log.error(
          'The signed-in account does not match the repository association'
        )
      }
      setHasRejectedCredentialsForEndpoint(token, endpoint)
      return undefined
    }

    return credWithAccount(cred, account)
  }

  // GitHub.com/GHE creds are only stored internally
  if (endpointKind !== 'generic') {
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
async function eraseCredential(
  cred: Credential,
  store: Store,
  repositoriesStore: RepositoriesStore,
  token: string
) {
  if ((await getEndpointKind(cred, store)) !== 'generic') {
    const account = accountForCredential(
      await store.getAll(),
      await repositoriesStore.getAll(),
      getTrampolineEnvironmentPath(token),
      `${getCredentialUrl(cred)}`,
      undefined,
      getCredentialAccountIdentity(token)
    )
    if (account !== undefined && cred.get('password') === account.token) {
      try {
        await API.fromAccount(account).fetchAccount()
      } catch (error) {
        if (
          error instanceof APIError &&
          error.responseStatus === HttpStatusCode.Unauthorized
        ) {
          await store.removeAccount(account)
        } else {
          log.warn(
            'Could not verify GitHub credential after Git rejected it',
            error
          )
        }
      }
    }
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

export const createCredentialHelperTrampolineHandler: (
  store: AccountsStore,
  repositoriesStore: RepositoriesStore
) => TrampolineCommandHandler =
  (store: Store, repositoriesStore: RepositoriesStore) => async command => {
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
        const cred = await getCredential(input, store, repositoriesStore, token)
        if (!cred) {
          const endpoint = `${getCredentialUrl(input)}`
          info(`could not find credential for ${endpoint}`)
          setHasRejectedCredentialsForEndpoint(token, endpoint)
        }
        return cred ? formatCredential(cred) : undefined
      } else if (firstParameter === 'store') {
        await storeCredential(input, store, token)
      } else if (firstParameter === 'erase') {
        await eraseCredential(input, store, repositoriesStore, token)
      }
      return undefined
    } catch (e) {
      error(`${firstParameter} failed`, e)
      return undefined
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
