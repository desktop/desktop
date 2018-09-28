/** get all regex catpures within a body of text (recursively)
 * @param text string to search
 * @param re regex to search with. must have global option and one capture
 * @param matches optional set to start from
 * @returns set of strings captured by supplied regex
 */
export function getCaptures(
  text: string,
  re: RegExp,
  matches = new Set<Array<string>>()
): Set<Array<string>> {
  const match = re.exec(text)
  if (match) {
    matches.add(match.slice(1))
    getCaptures(text, re, matches)
  }
  return matches
}
