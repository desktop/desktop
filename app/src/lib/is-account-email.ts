/**
 * Checks if a given email address is included (case-insensitively) among the
 * email addresses belonging to one or more accounts.
 *
 * Note: this check must be used only to decide whether or not when to warn the
 *       user about the chance of getting misattributed commits, but not to
 *       override a different but equivalent email address that the user entered
 *       on purpose. For example, the user's account might have an address like
 *       My.Email@domain.com, but they'd rather use my.email@domain in their git
 *       commits.
 *
 * @param accountEmails Email addresses belonging to user accounts.
 * @param email         Email address to validate.
 */
export function isAccountEmail(
  accountEmails: ReadonlyArray<string>,
  email: string
) {
  const lowercaseAccountEmails = accountEmails.map(email => email.toLowerCase())
  return lowercaseAccountEmails.includes(email.toLowerCase())
}
