/** Convert input string to current platform's text case preference. */
export function toPlatformCase(inputText: string): string {
  inputText = inputText.toLowerCase()

  if (__DARWIN__) {
    // Capitalize the first letter of every word.
    inputText = inputText.replace(/\b[a-z]/gi, $1 => $1.toUpperCase())
  } else {
    // Capitalize the first letter of the first word.
    inputText = inputText.replace(/\b[a-z]/i, $1 => $1.toUpperCase())
  }

  return inputText
}
