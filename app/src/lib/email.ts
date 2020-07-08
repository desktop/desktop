import * as URL from 'url'

import { IAPIEmail, getDotComAPIEndpoint } from './api'
import { Account } from '../models/account'

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
    return getStealthEmailFor(account)
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
  // older Enterprise Server which doesn't have the concept of visiblity.
  return email.visibility === 'public' || !email.visibility
}

/**
 * Get the default email address belonging to a user
 *
 * @param emails Array of email details returned from GitHub API
 * @returns the email address from the first element in the array, or an empty
 *          string if the array is empty
 */
export function getDefaultEmail(emails: ReadonlyArray<IAPIEmail>): string {
  if (emails.length === 0) {
    return ''
  }

  return emails[0].email || ''
}

/**
 * Returns the stealth email host name for a given endpoint. The stealth
 * email host is hardcoded to the subdomain users.noreply under the
 * endpoint host.
 */
function getStealthEmailHostForEndpoint(endpoint: string) {
  return getDotComAPIEndpoint() !== endpoint
    ? `users.noreply.${URL.parse(endpoint).hostname}`
    : 'users.noreply.github.com'
}

function getLegacyStealthEmailFor(account: Account) {
  const stealthEmailHost = getStealthEmailHostForEndpoint(account.endpoint)
  return `${account.login}@${stealthEmailHost}`
}

function getStealthEmailFor(account: Account) {
  const stealthEmailHost = getStealthEmailHostForEndpoint(account.endpoint)
  return `${account.id}+${account.login}@${stealthEmailHost}`
}

/**
 * Produces a list of all email addresses that when used as the author email
 * in a commit we'll know will end up getting attributted to the given
 * account when pushed to GitHub.com or GitHub Enterprise Server.
 *
 * The list of email addresses consists of all the email addresses we get
 * from the API (since this is for the currently signed in user we get
 * public as well as private email addresses here) as well as the legacy
 * and modern format of the anonymous email addresses, for example:
 *
 *  desktop@users.noreply.github.com
 *  13171334+desktop@users.noreply.github.com
 */
export function getAttributableEmailsFor(
  account: Account
): ReadonlyArray<string> {
  const uniqueEmails = new Set<string>([
    ...account.emails.map(x => x.email),
    getLegacyStealthEmailFor(account),
    getStealthEmailFor(account),
  ])

  return [...uniqueEmails]
}
