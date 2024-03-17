import { IAPIEmail } from './api'
import { Account } from '../models/account'
import { isGHES } from './endpoint-capabilities'

/**
 * Lookup a suitable email address to display in the application, based on the
 * following rules:
 *
 *  - the primary email if it's publicly visible
 *  - an anonymous (i.e. '@users.noreply.github.com') email address
 *  - the first email address returned from the API
 *  - an automatically generated stealth email based on the user's
 *    login, id, and endpoint.
 *
 * @param emails array of email addresses associated with an account
 */
export function lookupPreferredEmail(account: Account): string {
  const emails = account.emails

  if (emails.length === 0) {
    return getStealthEmailForUser(account.id, account.login, account.endpoint)
  }

  const primary = emails.find(e => e.primary)
  if (primary && isEmailPublic(primary)) {
    return primary.email
  }

  const stealthSuffix = `@${getStealthEmailHostForEndpoint(account.endpoint)}`
  const noReply = emails.find(e =>
    e.email.toLowerCase().endsWith(stealthSuffix)
  )

  if (noReply) {
    return noReply.email
  }

  return emails[0].email
}

/**
 * Is the email public?
 */
function isEmailPublic(email: IAPIEmail): boolean {
  // If an email doesn't have a visibility setting it means it's coming from an
  // older Enterprise version which doesn't have the concept of visibility.
  return email.visibility === 'public' || !email.visibility
}

/**
 * Returns the stealth email host name for a given endpoint. The stealth
 * email host is hardcoded to the subdomain users.noreply under the
 * endpoint host.
 */
const getStealthEmailHostForEndpoint = (endpoint: string) =>
  isGHES(endpoint)
    ? `users.noreply.${new URL(endpoint).hostname}`
    : 'users.noreply.github.com'

/**
 * Generate a legacy stealth email address for the user
 * on the given server.
 *
 * Ex: desktop@users.noreply.github.com
 *
 * @param login    The user handle or "login"
 * @param endpoint The API endpoint that this login belongs to,
 *                 either GitHub.com or a GitHub Enterprise
 *                 instance
 */
export function getLegacyStealthEmailForUser(login: string, endpoint: string) {
  const stealthEmailHost = getStealthEmailHostForEndpoint(endpoint)
  return `${login}@${stealthEmailHost}`
}

/**
 * Generate a stealth email address for the user on the given
 * server.
 *
 * Ex: 123456+desktop@users.noreply.github.com
 *
 * @param id       The numeric user id as returned by the endpoint
 *                 API. See getLegacyStealthEmailFor if no user id
 *                 is available.
 * @param login    The user handle or "login"
 * @param endpoint The API endpoint that this login belongs to,
 *                 either GitHub.com or a GitHub Enterprise
 *                 instance
 */
export function getStealthEmailForUser(
  id: number,
  login: string,
  endpoint: string
) {
  const stealthEmailHost = getStealthEmailHostForEndpoint(endpoint)
  return `${id}+${login}@${stealthEmailHost}`
}

/**
 * Gets a value indicating whether a commit email matching the given email would
 * get attributed to the account (i.e. user) if pushed to the endpoint that said
 * account belongs to.
 *
 * When determining if an email is attributable to an account we consider a list
 * of email addresses consisting of all the email addresses we get from the API
 * (since this is for the currently signed in user we get public as well as
 * private email addresses here) as well as the legacy and modern format of the
 * anonymous email addresses, for example:
 *
 *  desktop@users.noreply.github.com
 *  13171334+desktop@users.noreply.github.com
 */
export const isAttributableEmailFor = (account: Account, email: string) => {
  const { id, login, endpoint, emails } = account
  const needle = email.toLowerCase()

  return (
    emails.some(({ email }) => email.toLowerCase() === needle) ||
    getStealthEmailForUser(id, login, endpoint).toLowerCase() === needle ||
    getLegacyStealthEmailForUser(login, endpoint).toLowerCase() === needle
  )
}

/**
 * A regular expression meant to match both the legacy format GitHub.com
 * stealth email address and the modern format (login@ vs id+login@).
 *
 * Yields two capture groups, the first being an optional capture of the
 * user id and the second being the mandatory login.
 */
const StealthEmailRegexp = /^(?:(\d+)\+)?(.+?)@(users\.noreply\..+)$/i

export const parseStealthEmail = (email: string, endpoint: string) => {
  const stealthEmailHost = getStealthEmailHostForEndpoint(endpoint)
  const match = StealthEmailRegexp.exec(email)

  if (!match || stealthEmailHost !== match[3]) {
    return null
  }

  const [, id, login] = match
  return { id: id ? parseInt(id, 10) : undefined, login }
}
