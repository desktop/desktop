// Git forbids names consisting entirely of these characters
// (what Git calls crud) but as long as there's at least one
// valid character in the name it'll strip the crud and be happy.
// See https://github.com/git/git/blob/e629a7d28a405e/ident.c#L191-L203
const crudCharactersRe = /^[\x00-\x20.,:;<>"\\']+$/

/**
 * Returns a value indicating whether the given `name` is a valid
 * Git author name that can be used for the `user.name` Git config
 * setting without producing an error about disallowed characters
 * at commit time.
 *
 * This logic is intended to be an exact copy of that of Git's own
 * logic, see https://github.com/git/git/blob/e629a7d28a/ident.c#L401
 *
 * Note that this method considers an empty string to be a valid
 * author name.
 */
export function gitAuthorNameIsValid(name: string): boolean {
  return !crudCharactersRe.test(name)
}

export const invalidGitAuthorNameMessage =
  'Name is invalid, it consists only of disallowed characters.'
