/** Truncate a single line unicode string by a given maxLength and add ellipsis if necessary */
export function truncateWithEllipsis(str: string, maxLength: number) {
  if (str.length <= maxLength) {
    return str
  }

  // String.prototype[@@iterator]() is unicode-aware, using it here to get
  // correct unicode string length
  const codePoints = [...str]
  if (codePoints.length <= maxLength) {
    return str
  }

  // combine variation selectors with corresponding characters
  const characters = codePoints.reduce((characters: Array<string>, code) => {
    if (code >= '\uFE00' && code <= '\uFE0F') {
      if (characters.length) {
        characters.push(`${characters.pop()}${code}`)
      }
    } else {
      characters.push(code)
    }
    return characters
  }, [])

  if (characters.length <= maxLength) {
    return str
  }

  const result = characters.slice(0, maxLength).join('')
  return `${result}…`
}
