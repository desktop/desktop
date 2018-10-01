import { spawnAndComplete } from './spawn'
import { getCaptures } from '../helpers/regex'

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
  const flatSet = new Set<string>()
  const captures = await getCaptures(outputStr, fileNameCaptureRe)
  captures.forEach(match =>
    // fileNameCaptureRe only has one capture
    flatSet.add(match[0])
  )
  return flatSet
}

/** matches a line reporting a leftover conflict marker
 *  and captures the name of the file
 */
const fileNameCaptureRe = /(.+):\d+: leftover conflict marker/gi
