import { fatalError } from '../../lib/fatal-error'

export function disallowedCharacters(values: string): string | null {
  if (values.length === 0) {
    return null
  }

  for (const value of values) {
    if (disallowedCharacter(value) === false) {
      return null
    }
  }
  return values
}

function disallowedCharacter(value: string): boolean {
  if (value.length !== 1) {
    return fatalError('`value` must be a single character')
  }

  const disallowedCharacters = [
    '.',
    ',',
    ':',
    ';',
    '<',
    '>',
    '"',
    '\\',
    "'",
    ' ',
  ]
  const hasDisallowedCharacter = disallowedCharacters.indexOf(value) >= 0
  const hasDisallowedAsciiCharacter = value.charCodeAt(0) <= 32

  return hasDisallowedCharacter || hasDisallowedAsciiCharacter
}
