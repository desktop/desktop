import { IEmail } from '../models/email'

export function lookupEmail(emails: ReadonlyArray<IEmail>): IEmail | null {
  const visibleEmails = emails.filter(email => email.visibility !== 'private')

  if (!visibleEmails.length) {
    return null
  }

  const noreplyExists = visibleEmails.find(email => email.email.toLowerCase().endsWith('@users.noreply.github.com')) || null
  if (noreplyExists) {
    return noreplyExists
  }

  const primaryExists = visibleEmails.find(email => email.primary) || null
  if (primaryExists) {
    return primaryExists
  }

  return visibleEmails[0]
}
