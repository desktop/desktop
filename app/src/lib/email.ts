import { IEmail } from '../models/email'

/**
 * Lookup a suitable email address to display in the application, based on the
 * following rules:
 *
 *  - an '@users.noreply.github.com' email address
 *  - an email address set with 'primary=true'
 *  - the first email address
 *
 * Otherwise just return null
 *
 * @param emails array of email addresses associated with an account
 */
export function lookupPreferredEmail(
  emails: ReadonlyArray<IEmail>
): IEmail | null {
  if (emails.length === 0) {
    return null
  }

  const noReply = emails.find(e =>
    e.email.toLowerCase().endsWith('@users.noreply.github.com')
  )
  if (noReply) {
    return noReply
  }

  const primary = emails.find(e => e.primary)
  if (primary) {
    return primary
  }

  return emails[0]
}
