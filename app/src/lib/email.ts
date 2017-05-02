import { IEmail } from '../models/email'

/**
 * Lookup a suitable email address to display in the application, respecting
 * the settings for visibility and primary when the user has multiple
 * addresses defined.
 *
 * @param emails array of email addresses associated with an account
 */
export function lookupEmail(emails: ReadonlyArray<IEmail>): IEmail | null {
  const visibleEmails = emails.filter(email => email.visibility !== 'private')

  if (!visibleEmails.length) {
    return null
  }

  const noreplyExists = visibleEmails.find(e => e.email.toLowerCase().endsWith('@users.noreply.github.com'))
  if (noreplyExists) {
    return noreplyExists
  }

  const primaryExists = visibleEmails.find(e => e.primary)
  if (primaryExists) {
    return primaryExists
  }

  return visibleEmails[0]
}
