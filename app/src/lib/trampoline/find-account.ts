import memoizeOne from 'memoize-one'
import { getHTMLURL } from '../api'
import { getGenericPassword, getGenericUsername } from '../generic-git-auth'
import { AccountsStore } from '../stores'
import { urlWithoutCredentials } from './url-without-credentials'
import { Account } from '../../models/account'
import { IAccountIdentity } from '../../models/repository'

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

export async function findGitHubTrampolineAccount(
  accountsStore: AccountsStore,
  remoteUrl: string,
  identity?: IAccountIdentity | null
): Promise<Account | undefined> {
  if (identity === null) {
    return undefined
  }

  const accounts = await accountsStore.getAll()
  const parsedUrl = new URL(remoteUrl)
  const matching = accounts.filter(
    a => new URL(getHTMLURL(a.endpoint)).origin === parsedUrl.origin
  )
  return identity === undefined
    ? matching.length === 1
      ? matching[0]
      : undefined
    : matching.find(
        account =>
          account.endpoint === identity.endpoint && account.id === identity.id
      )
}

export async function findGenericTrampolineAccount(
  trampolineToken: string,
  remoteUrl: string
) {
  const parsedUrl = new URL(remoteUrl)
  const endpoint = urlWithoutCredentials(remoteUrl)

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
    log.warn(`credential: generic password for ${remoteUrl} missing`)
    return undefined
  }

  return { login, endpoint, token }
}
