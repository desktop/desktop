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

  return text
    .split('\n')
    .map(line =>
      line.split('\r').reduce((buf, cur) =>
        // Happy path, if the new line is equal to or longer
        // than the previous, we can just use the new one
        // without creating any new strings.
        cur.length >= buf.length ? cur : cur + buf.substring(cur.length)
      )
    )
    .join('\n')
}
