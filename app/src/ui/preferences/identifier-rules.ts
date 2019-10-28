// Git forbits names consisting entirely of these forbidden
// characters (what Git calls crud) but as long as there's at
// least one valid character in the name it'll strip the leading
// and trailing crud characters and be happy.
// See https://github.com/git/git/blob/e629a7d28a405e/ident.c#L191-L203
const disallowedCharactersRe = /^[\x00-\x20.,:;<>"\\']+$/

export function disallowedCharacters(values: string): string | null {
  if (disallowedCharactersRe.test(values)) {
    return values
  }

  return null
}
