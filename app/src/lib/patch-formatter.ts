import { WorkingDirectoryFileChange, FileStatus } from '../models/status'
import { DiffLineType, Diff } from '../models/diff'

/**
 * Generates a string matching the format of a GNU unified diff header excluding
 * the (optional) timestamp fields
 *
 * Note that this multi-line string includes a trailing newline.
 *
 * @param from         The relative path to the original version of the file or
 *                     null if the file is newly created.
 *
 * @param to           The relative path to the new version of the file or
 *                     null if the file is the file is newly created.
 */
function formatPatchHeader(from: string | null, to: string | null): string {
  // https://en.wikipedia.org/wiki/Diff_utility
  //
  // > At the beginning of the patch is the file information, including the full
  // > path and a time stamp delimited by a tab character.
  // >
  // > [...] the original file is preceded by "---" and the new file is preceded
  // > by "+++".
  //
  // We skip the time stamp since to match git
  const fromPath = from ? `a/${from}` : '/dev/null'
  const toPath =  to ? `b/${to}` : '/dev/null'

  return `--- ${fromPath}\n+++ ${toPath}\n`
}

function formatPatchHeaderForFile(file: WorkingDirectoryFileChange) {
  switch (file.status) {
    case FileStatus.New: return formatPatchHeader(null, file.path)

    // TODO: Is conflicted the same as modified?
    case FileStatus.Conflicted:
    case FileStatus.Modified:
    case FileStatus.Deleted:
      return formatPatchHeader(file.path, file.path)

    case FileStatus.Renamed:
      // TODO: Must add oldPath to file
      throw new Error('file renames not supported')

    case FileStatus.Unknown:
    default:
      throw new Error('unknown file statuses not supported')
  }
}

/**
 * Generates a string matching the format of a GNU unified diff hunk header.
 * Note that this single line string includes a single trailing newline.
 *
 * @param oldStartLine The line in the old (or original) file where this diff
 *                     hunk starts.
 *
 * @param oldLineCount The number of lines in the old (or original) file that
 *                     this diff hunk covers.
 *
 * @param newStartLine The line in the new file where this diff hunk starts
 *
 * @param newLineCount The number of lines in the new file that this diff hunk
 *                     covers
 */
function formatHunkHeader(
  oldStartLine: number,
  oldLineCount: number,
  newStartLine: number,
  newLineCount: number,
  sectionHeading?: string | null) {

    // > @@ -l,s +l,s @@ optional section heading
    // >
    // > The hunk range information contains two hunk ranges. The range for the hunk of the original
    // > file is preceded by a minus symbol, and the range for the new file is preceded by a plus
    // > symbol. Each hunk range is of the format l,s where l is the starting line number and s is
    // > the number of lines the change hunk applies to for each respective file.
    // >
    // > In many versions of GNU diff, each range can omit the comma and trailing value s,
    // > in which case s defaults to 1
    const lineInfoBefore = oldLineCount === 1
      ? `${oldStartLine}`
      : `${oldStartLine},${oldLineCount}`

    const lineInfoAfter = newLineCount === 1
      ? `${newStartLine}`
      : `${newStartLine},${newLineCount}`

    sectionHeading = sectionHeading ? ` ${sectionHeading}` : ''

    return `@@ -${lineInfoBefore} +${lineInfoAfter} @@${sectionHeading}\n`
}

export function createPatch(file: WorkingDirectoryFileChange, diff: Diff): string {
  let patch = ''

  const isNew = file.status === FileStatus.New

  diff.hunks.forEach((hunk, hunkIndex) => {


    let hunkBuf = ''
    const oldStart = isNew ? 0 : hunk.header.oldStartLine
    let oldCount = 0
    const newStart = isNew ? 0 : hunk.header.newStartLine
    let newCount = 0

    let contextLines = 0
    let totalLines = 0

    hunk.lines.forEach((line, lineIndex) => {
      const absoluteIndex = hunk.unifiedDiffStart + lineIndex

      if (line.type === DiffLineType.Hunk) { return }

      if (line.type === DiffLineType.Context) {
        if (!isNew) {
          hunkBuf += `${line.text}\n`
          oldCount++
          newCount++
          contextLines++
        }
      } else {
        if (file.selection.isSelected(absoluteIndex)) {
          hunkBuf += `${line.text}\n`
          if (line.type === DiffLineType.Add) { newCount++ }
          if (line.type === DiffLineType.Delete) { oldCount++ }
        } else if (!isNew) {
          hunkBuf += ` ${line.text.substr(1)}\n`
          oldCount++
          newCount++
          contextLines++
        }
      }

      totalLines++
    })

    if (contextLines === totalLines)  { return }

    patch += formatHunkHeader(oldStart, oldCount, newStart, newCount)
    patch += hunkBuf
  })

  if (!patch.length) {
    throw new Error('')
  }

  patch = formatPatchHeaderForFile(file) + patch

  return patch
}
