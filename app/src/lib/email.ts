import { IAPIEmail } from './api'

export function filterAndSort(emails: Array<IAPIEmail>): ReadonlyArray<IAPIEmail> {
  const visibleEmails = emails.filter(email => email.visibility === null)
  return visibleEmails.sort(sortByPrimaryThenAlphabetically)
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
