/**
 * Get all regex captures within a body of text
 *
 * @param text string to search
 * @param re regex to search with. must have global option and one capture
 *
 * @returns arrays of strings captured by supplied regex
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
 * Get all regex matches within a body of text
 *
 * @param text string to search
 * @param re regex to search with. must have global option
 * @returns set of strings captured by supplied regex
 */
export function getMatches(text: string, re: RegExp): Array<RegExpExecArray> {
  if (re.global === false) {
    throw new Error(
      'A regex has been provided that is not marked as global, and has the potential to execute forever if it finds a match'
    )
  }

  const matches = new Array<RegExpExecArray>()
  let match = re.exec(text)

  while (match !== null) {
    matches.push(match)
    match = re.exec(text)
  }
  return matches
}

/**
 * Replaces characters that have a semantic meaning inside of a regexp with
 * their escaped equivalent (i.e. `*` becomes `\*` etc).
 *
 * See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#Escaping
 */
export function escapeRegExp(expression: string) {
  return expression.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&')
}

export function getFileFromExceedsError(error: string): string | null {
  const endRegex = /(\sis\s\d+.\d+ [a-zA-Z]+;\sthis\sexceeds\sGitHub's\sfile\ssize\slimit\sof\s100.00\sMB)/gm;
  const beginRegex = /(^remote:\serror:\sFile\s)/gm
  const beginMatch = beginRegex.exec(error)
  const endMatch = endRegex.exec(error)
  
  if(beginMatch && beginMatch.index && endMatch && endMatch.index)
  {
    return "\n\nFile: " + error.slice(beginMatch.index + beginMatch[0].length, endMatch.index);
  }
  
  return null;
}
