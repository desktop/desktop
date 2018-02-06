import { IAPIEmail } from './api'

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
export function lookupPreferredEmail(
  emails: ReadonlyArray<IAPIEmail>
): IAPIEmail | null {
  if (emails.length === 0) {
    return null
  }

  const primary = emails.find(e => e.primary)
  if (primary && isEmailPublic(primary)) {
    return primary
  }

  const noReply = emails.find(e =>
    e.email.toLowerCase().endsWith('@users.noreply.github.com')
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
  // older Enterprise server which doesn't have the concept of visiblity.
  return email.visibility === 'public' || !email.visibility
}
