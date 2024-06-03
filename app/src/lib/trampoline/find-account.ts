import memoizeOne from 'memoize-one'
import { getHTMLURL } from '../api'
import { getGenericPassword, getGenericUsername } from '../generic-git-auth'
import { AccountsStore } from '../stores'
import { setMostRecentGenericGitCredential } from './trampoline-environment'
import { IGitAccount } from '../../models/git-account'
import { urlWithoutCredentials } from './url-without-credentials'

/**
 * When we're asked for credentials we're typically first asked for the username
 * immediately followed by the password. We memoize the getGenericPassword call
 * such that we only call it once per endpoint/login pair. Since we include the
 * trampoline token in the invalidation key we'll only call it once per
 * trampoline session.
 */
const memoizedGetGenericPassword = memoizeOne(
  (_trampolineToken: string, endpoint: string, login: string) =>
    getGenericPassword(endpoint, login)
)

export async function findAccount(
  trampolineToken: string,
  accountsStore: AccountsStore,
  remoteUrl: string
): Promise<IGitAccount | undefined> {
  const accounts = await accountsStore.getAll()
  const parsedUrl = new URL(remoteUrl)
  const endpoint = urlWithoutCredentials(remoteUrl)
  const account = accounts.find(
    a => new URL(getHTMLURL(a.endpoint)).origin === parsedUrl.origin
  )

  if (account) {
    return account
  }

  const login =
    parsedUrl.username === ''
      ? getGenericUsername(endpoint)
      : parsedUrl.username

  if (!login) {
    return undefined
  }

  const token = await memoizedGetGenericPassword(
    trampolineToken,
    endpoint,
    login
  )

  if (!token) {
    // We have a username but no password, that warrants a warning
    log.warn(`askPassHandler: generic password for ${remoteUrl} missing`)
    return undefined
  }

  setMostRecentGenericGitCredential(trampolineToken, endpoint, login)

  return { login, endpoint, token }
}
