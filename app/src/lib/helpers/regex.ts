/**
 * get all regex captures within a body of text
 * @param text string to search
 * @param re regex to search with. must have global option and one capture
 * @returns ararys of strings captured by supplied regex
 */
export function getCaptures(
  text: string,
  re: RegExp
): ReadonlyArray<Array<string>> {
  const matches = getMatches(text, re)
  const captures = matches.reduce(
    (acc, match) => acc.concat([match.slice(1)]),
    new Array<Array<string>>()
  )
  return captures
}

/**
 * get all regex matches within a body of text
 * @param text string to search
 * @param re regex to search with. must have global option
 * @returns set of strings captured by supplied regex
 */
export function getMatches(text: string, re: RegExp): Array<RegExpExecArray> {
  const matches = new Array<RegExpExecArray>()
  let match = re.exec(text)

  while (match !== null) {
    matches.push(match)
    match = re.exec(text)
  }
  return matches
}
