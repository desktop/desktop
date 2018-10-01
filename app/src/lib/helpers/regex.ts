/**
 * get all regex catpures within a body of text
 * @param text string to search
 * @param re regex to search with. must have global option and one capture
 * @returns set of strings captured by supplied regex
 */
export async function getCaptures(
  text: string,
  re: RegExp
): Promise<Set<Array<string>>> {
  const matches = await getMatches(text, re)
  const captures = matches.reduce(
    (captures, match) => captures.add(match.slice(1)),
    new Set<Array<string>>()
  )
  return captures
}

/**
 * get all regex matches within a body of text
 * @param text string to search
 * @param re regex to search with. must have global option
 * @returns set of strings captured by supplied regex
 */
export async function getMatches(
  text: string,
  re: RegExp
): Promise<Array<RegExpExecArray>> {
  const matches = new Array<RegExpExecArray>()
  const getNextMatch = () =>
    new Promise(resolve => {
      const match = re.exec(text)
      if (match !== null) {
        matches.push(match)
        resolve(getNextMatch())
      }
      resolve(matches)
    })
  await getNextMatch()
  return matches
}
