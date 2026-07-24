import {
  DiffLineType,
  DiffType,
  IDiff,
  ILargeTextDiff,
  ITextDiff,
} from '../models/diff'

function isTextualDiff(diff: IDiff): diff is ITextDiff | ILargeTextDiff {
  return diff.kind === DiffType.Text || diff.kind === DiffType.LargeText
}

/**
 * Format a single file's diff for pasting into an AI tool or elsewhere.
 *
 * Includes the file path plus every removed (-) and added (+) line in
 * order, preserving the sequence of changes while omitting context lines
 * and hunk headers for a more compact, AI-friendly summary.
 *
 * Returns null when the diff has no textual add/delete lines (binary,
 * image, empty, etc.).
 */
export function formatDiffForClipboard(
  filePath: string,
  diff: IDiff
): string | null {
  if (!isTextualDiff(diff)) {
    return null
  }

  const changedLines: string[] = []

  for (const hunk of diff.hunks) {
    for (const line of hunk.lines) {
      if (line.type === DiffLineType.Delete) {
        changedLines.push(`- ${line.content}`)
      } else if (line.type === DiffLineType.Add) {
        changedLines.push(`+ ${line.content}`)
      }
    }
  }

  if (changedLines.length === 0) {
    return null
  }

  return [`File: ${filePath}`, '', ...changedLines].join('\n')
}

/**
 * Format and join diffs for multiple files into a single clipboard string.
 * Files with no copyable textual changes are skipped.
 */
export function formatDiffsForClipboard(
  files: ReadonlyArray<{ path: string; diff: IDiff }>
): string | null {
  const parts: string[] = []

  for (const { path, diff } of files) {
    const formatted = formatDiffForClipboard(path, diff)
    if (formatted !== null) {
      parts.push(formatted)
    }
  }

  return parts.length > 0 ? parts.join('\n\n') : null
}
