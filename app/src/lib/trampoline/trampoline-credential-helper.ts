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

type Cred = Map<string, string>

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
const credWithAccount = (c: Cred, a: IGitAccount | undefined) =>
  a && new Map(c).set('username', a.login).set('password', a.token)

/** Get the value of a credential field (ex 'host') or throw if missing */
const getRequiredCredField = (cred: Cred, field: string) =>
  forceUnwrap(`credential missing ${field}`, cred.get(field))

const getGitHubCredential = (c: Cred, store: AccountsStore, endpoint: string) =>
  findGitHubTrampolineAccount(store, endpoint)
    .then(a => credWithAccount(c, a))
    .then(c => {
      if (c) {
        info(`found GitHub credential for ${endpoint} in store`)
      }
      return c
    })

const getGenericCredential = (c: Cred, token: string, endpoint: string) =>
  findGenericTrampolineAccount(token, endpoint)
    .then(a => credWithAccount(c, a))
    .then(c => {
      if (c) {
        info(`found generic credential for ${endpoint}`)
      }
      return c
    })

const getExternalCredentialHelperCredential = (c: Cred, token: string) =>
  fillCredential(c, getTrampolineEnvironmentPath(token)).then(c => {
    if (c) {
      info(`found credential for ${getCredentialUrl(c)} in external helper`)
    }
    return c
  })

/** Implementation of the 'get' git credential helper command */
const getCredential = async (cred: Cred, store: AccountsStore, token: string) =>
  (await getGitHubCredential(cred, store, `${getCredentialUrl(cred)}`)) ??
  (useExternalCredentialHelper()
    ? getExternalCredentialHelperCredential(cred, token)
    : getGenericCredential(cred, token, `${getCredentialUrl(cred)}`))

/**
 * Determines whether the credential provided should be managed within GitHub
 * or not. This includes all GitHub.com accounts and any other accounts that
 * Desktop is currently signed in as (i.e. available in the accounts store).
 */
const credentialStoredInternally = async (cred: Cred, store: AccountsStore) => {
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
const storeCredential = async (
  cred: Cred,
  store: AccountsStore,
  token: string
) => {
  if (await credentialStoredInternally(cred, store)) {
    return
  }

  return useExternalCredentialHelper()
    ? approveCredential(cred, getTrampolineEnvironmentPath(token))
    : setGenericCredential(
        urlWithoutCredentials(getCredentialUrl(cred)),
        getRequiredCredField(cred, 'username'),
        getRequiredCredField(cred, 'password')
      )
}

/** Implementation of the 'erase' git credential helper command */
const eraseCredential = async (
  cred: Cred,
  store: AccountsStore,
  token: string
) => {
  if (await credentialStoredInternally(cred, store)) {
    return
  }

  return useExternalCredentialHelper()
    ? rejectCredential(cred, getTrampolineEnvironmentPath(token))
    : deleteGenericCredential(
        urlWithoutCredentials(getCredentialUrl(cred)),
        getRequiredCredField(cred, 'username')
      )
}

export const createCredentialHelperTrampolineHandler: (
  accountsStore: AccountsStore
) => TrampolineCommandHandler = (store: AccountsStore) => async command => {
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
