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

/*
 * Looks for the phrases "remote: error File " and " is (file size I.E. 106.5 MB); this exceeds GitHub's file size limit of 100.00 MB"
 * inside of a string containing errors and return an array of all the filenames and their sizes located between these two strings.
 *
 * example return [ "LargeFile.exe (150.00 MB)", "AlsoTooLargeOfAFile.txt (1.00 GB)" ]
 */
export function getFileFromExceedsError(error: string): string[] {
  const endRegex = /(;\sthis\sexceeds\sGitHub's\sfile\ssize\slimit\sof\s100.00\sMB)/gm
  const beginRegex = /(^remote:\serror:\sFile\s)/gm
  const beginMatches = Array.from(error.matchAll(beginRegex))
  const endMatches = Array.from(error.matchAll(endRegex))

  // Something went wrong and we didn't find the same amount of endings as we did beginnings
  // Just return an empty array as the output we'd give would look weird anyway
  if (beginMatches.length !== endMatches.length) {
    return []
  }

  const files: string[] = []

  for (let index = 0; index < beginMatches.length; index++) {
    const beginMatch = beginMatches[index]
    const endMatch = endMatches[index]

    if (beginMatch.index === undefined || endMatch.index === undefined) {
      continue
    }

    const from = beginMatch.index + beginMatch[0].length
    const to = endMatch.index
    let file = error.slice(from, to)
    file = file.replace('is ', '(')
    file += ')'
    files.push(file)
  }

  return files
}
