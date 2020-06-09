/**
 * Parses carriage returns the same way a terminal would, i.e by
 * moving the cursor and (potentially) overwriting text.
 *
 * Git (and many other CLI tools) use this trick to present the
 * user with nice looking progress. When writing something like...
 *
 * 'Downloading: 1%  \r'
 * 'Downloading: 2%  \r'
 *
 * ...to the terminal the user is gonna perceive it as if the 1 just
 * magically changes to a two.
 *
 * The carriage return character for all of you kids out there
 * that haven't yet played with a manual typewriter refers to the
 * "carriage" which held the character arms, see
 *
 *  https://en.wikipedia.org/wiki/Carriage_return#Typewriters
 */
export function parseCarriageReturn(text: string) {
  // Happy path, there are no carriage returns in
  // the text, making this method a noop.
  if (text.indexOf('\r') < 0) {
    return text
  }

  // JavaScript `.` includes unicode line and paragraph break
  // characters which is why we use [\s\S] instead of '.'. The
  // first group matches lazily (as few times as possible) and
  // tthe second group matches the next following \r or \n
  // character or the end of the string. Matching the end of the
  // string lets us avoid dealing with leftover characters outside
  // of the matching loop.
  const crLfOrEnd = /([\s\S]*?)([\r\n]|$)/g
  const lines = new Array<string>('')

  let col = 0
  let match

  while ((match = crLfOrEnd.exec(text)) !== null) {
    // If we match the $ (end of string) we'll get a zero
    // with match, this is a known problem in JS so we'll
    // need to bump the regexp cursor to ensure it fails to
    // match on the next round
    if (match.index === crLfOrEnd.lastIndex) {
      crLfOrEnd.lastIndex++
    }

    if (match[1].length > 0) {
      const line = lines[lines.length - 1]
      const before = line.substring(0, col)
      const after = line.substring(col + match[1].length)
      col += match[1].length
      lines[lines.length - 1] = `${before}${match[1]}${after}`
    }

    if (match[2] === '\r') {
      col = 0
    } else if (match[2] === '\n') {
      lines.push('')
    }
  }

  return lines.join('\n')
}
