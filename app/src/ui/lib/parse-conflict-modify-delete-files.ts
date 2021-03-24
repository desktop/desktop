/** Parse CONFLICT (modify/delete) errors to get the files that caused the error
 *
 * Example Error:
 * CONFLICT (modify/delete): app/src/ui/lib/draggable.tsx deleted in HEAD and modified in 0f777848d (Allow switching tab in branch menu during drag). Version 0f777848d (Allow switching tab in branch menu during drag) of app/src/ui/lib/draggable.tsx left in tree.
 * Auto-merging app/src/ui/branches/branches-container.tsx
 * CONFLICT (modify/delete): app/src/lib/drag-and-drop-manager.ts deleted in HEAD and modified in 0f777848d (Allow switching tab in branch menu during drag). Version 0f777848d (Allow switching tab in branch menu during drag) of app/src/lib/drag-and-drop-manager.ts left in tree.
 */

export function parseConflictModifyDeleteFiles(
  stdOut: string
): ReadonlyArray<string> {
  const files = new Array<string>()
  const lines = stdOut.split('\n')

  for (const line of lines) {
    if (!line.startsWith('CONFLICT')) {
      continue
    }

    const splitOnSpace = line.split(' ')
    if (splitOnSpace.length >= 3) {
      files.push(splitOnSpace[2].trim())
    }
  }

  return files
}

/**
 * Parse CONFLICT (modify/delete) errors to get commit summary of the commit
 * that caused the error
 */
export function parseConflictModifyDeleteCommitSummary(stdOut: string): string {
  const versionRegex = /Version\s.*\((.*)\)/
  const versionMatches = stdOut.match(versionRegex)
  if (versionMatches === null) {
    return ''
  }

  const commitSummaryRegex = /\((.*)\)/
  const summaryMatches = versionMatches[0].match(commitSummaryRegex)
  if (summaryMatches === null) {
    return ''
  }
  return summaryMatches[0].slice(1, -1)
}
