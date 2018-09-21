import { spawnAndComplete } from './spawn'

/** returns a list of files with conflict markers present
 * @param repositoryPath filepath to repository
 * @returns set of filepaths with conflict markers
 *
 */
export async function getFilesWithConflictMarkers(
  repositoryPath: string
): Promise<Set<string>> {
  // git operation
  const args = ['diff', '--check']
  const { output } = await spawnAndComplete(
    args,
    repositoryPath,
    'getFilesWithConflictMarkers',
    new Set([0, 2])
  )

  // result parsing
  const outputStr = output.toString('utf8')
  const fileNameCaptureRe = /(.+):\d+: leftover conflict marker/gi
  return getMatches(outputStr, fileNameCaptureRe, new Set<string>())
}

function getMatches(
  text: string,
  re: RegExp,
  matches: Set<string>
): Set<string> {
  const match = re.exec(text)
  if (match) {
    matches.add(match[1])
    getMatches(text, re, matches)
  }
  return matches
}
