import { IEmail } from '../models/email'

/**
 * Lookup a suitable email address to display in the application, respecting
 * the settings for visibility and primary when the user has multiple
 * addresses defined.
 *
 * @param emails array of email addresses associated with an account
 */
export function lookupEmail(emails: ReadonlyArray<IEmail>): IEmail | null {

  if (emails.length === 0) {
    return null
  }

  const primary = emails.find(e => e.primary)
  if (primary) {
    if (primary.visibility === 'public') {
      return primary
    }

    const noReply = emails.find(e => e.email.toLowerCase().endsWith('@users.noreply.github.com'))
    if (noReply) {
      return noReply
    }
  }

  return emails[0]
}
