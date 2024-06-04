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

type Credential = Map<string, string>
type Store = AccountsStore

const info = (msg: string) => log.info(`credential-helper: ${msg}`)
const debug = (msg: string) => log.debug(`credential-helper: ${msg}`)
const warn = (msg: string) => log.warn(`credential-helper: ${msg}`)
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

async function getGitHubCredential(cred: Credential, store: AccountsStore) {
  const endpoint = `${getCredentialUrl(cred)}`
  const account = await findGitHubTrampolineAccount(store, endpoint)
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
  const cred = await fillCredential(input, getTrampolineEnvironmentPath(token))
  if (cred) {
    info(`found credential for ${getCredentialUrl(cred)} in external helper`)
  }
  return cred
}

/** Implementation of the 'get' git credential helper command */
async function getCredential(cred: Credential, store: Store, token: string) {
  const ghCred = await getGitHubCredential(cred, store)

  if (ghCred || (await isCredentialStoredInternally(cred, store))) {
    return ghCred
  }

  return useExternalCredentialHelper()
    ? getExternalCredential(cred, token)
    : getGenericCredential(cred, token)
}

/**
 * Determines whether the credential provided should be managed within GitHub
 * or not. This includes all GitHub.com accounts and any other accounts that
 * Desktop is currently signed in as (i.e. available in the accounts store).
 */
async function isCredentialStoredInternally(cred: Credential, store: Store) {
  const credentialUrl = getCredentialUrl(cred)
  const endpoint = `${credentialUrl}`

  if (await findGitHubTrampolineAccount(store, endpoint)) {
    debug(`credential for ${endpoint} stored internally`)
    return true
  }

  if (credentialUrl.hostname === 'github.com') {
    warn(`credential for ${endpoint} not found in store`)
    return true
  }

  return false
}

/** Implementation of the 'store' git credential helper command */
async function storeCredential(cred: Credential, store: Store, token: string) {
  if (await isCredentialStoredInternally(cred, store)) {
    return
  }

  return useExternalCredentialHelper()
    ? approveCredential(cred, getTrampolineEnvironmentPath(token))
    : setGenericCredential(
        urlWithoutCredentials(getCredentialUrl(cred)),
        forceUnwrap(`credential missing username`, cred.get('username')),
        forceUnwrap(`credential missing password`, cred.get('password'))
      )
}

/** Implementation of the 'erase' git credential helper command */
async function eraseCredential(cred: Credential, store: Store, token: string) {
  if (await isCredentialStoredInternally(cred, store)) {
    return
  }

  return useExternalCredentialHelper()
    ? rejectCredential(cred, getTrampolineEnvironmentPath(token))
    : deleteGenericCredential(
        urlWithoutCredentials(getCredentialUrl(cred)),
        forceUnwrap(`credential missing username`, cred.get('username'))
      )
}

export const createCredentialHelperTrampolineHandler: (
  store: AccountsStore
) => TrampolineCommandHandler = (store: Store) => async command => {
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
      const cred = await getCredential(input, store, token)
      if (!cred) {
        info(`could not find credential for ${getCredentialUrl(input)}`)
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
