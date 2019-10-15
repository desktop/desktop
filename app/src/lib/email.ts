import * as URL from 'url'

import { IAPIEmail, getDotComAPIEndpoint } from './api'
import { Account } from '../models/account'

/**
 * Lookup a suitable email address to display in the application, based on the
 * following rules:
 *
 *  - the primary email if it's publicly visible
 *  - the first public email
 *  - an '@users.noreply.github.com' email address
 *  - the first email address
 *
 * Otherwise just return null
 *
 * @param emails array of email addresses associated with an account
 */
export function lookupPreferredEmail(account: Account): IAPIEmail | null {
  const emails = account.emails

  if (emails.length === 0) {
    return null
  }

  const primary = emails.find(e => e.primary)
  if (primary && isEmailPublic(primary)) {
    return primary
  }

  const stealthSuffix = `@${getStealthEmailHostForEndpoint(account.endpoint)}`

  const noReply = emails.find(e =>
    e.email.toLowerCase().endsWith(stealthSuffix)
  )

  if (noReply) {
    return noReply
  }

  return emails[0]
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
  const url = URL.parse(endpoint)
  return getDotComAPIEndpoint() !== endpoint
    ? `users.noreply.${url.hostname}`
    : 'users.noreply.github.com'
}
