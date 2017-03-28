import { IAPIEmail } from './api'

/**
 * Filter and sort the raw email address values returned from the GitHub API.
 *
 * It will ignore any private email addresses, and then sort by the primary
 * field, and fall back to alphabetical ordering after that.
 *
 * @param emails
 */
export function filterAndSort(emails: ReadonlyArray<IAPIEmail>): ReadonlyArray<IAPIEmail> {
  const visibleEmails = emails.filter(email => email.visibility !== 'private')
  return visibleEmails.sort(sortByPrimaryThenAlphabetically)
}

/**
 * Resolve a suitable email address to use in the app for the current user.
 *
 * This will favour if a `noreply` email has been found in the list,
 * or will otherwise fall back to using the first email address.
 *
 * @param emails
 */
export function lookupEmail(emails: ReadonlyArray<string>): string | null {
  const noReplyFound = emails.find(email => email.toLowerCase().endsWith('@users.noreply.github.com'))

  if (noReplyFound) { return noReplyFound }

  return emails[0] || null
}

function sortByPrimaryThenAlphabetically(a: IAPIEmail, b: IAPIEmail): number {
  // Compare primary values first and favour whenever primary is found.
  // We only ever expect one primary email address.
  if (a.primary && !b.primary) {
    return -2
  }
  if (!a.primary && b.primary) {
    return 2
  }

  // normalize this value so that it fits within the acceptable range
  const textCompare = a.email.localeCompare(b.email)

  if (textCompare < 0) {
    return -1
  } else if (textCompare > 0) {
    return 1
  } else {
    return 0
  }
}
