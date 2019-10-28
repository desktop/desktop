const disallowedCharactersRe = /^[\x00-\x20.,:;<>"\\']+$/

export function disallowedCharacters(values: string): string | null {
  if (values.length === 0) {
    return null
  }

  if (disallowedCharactersRe.test(values)) {
    return values
  }

  return null
}
