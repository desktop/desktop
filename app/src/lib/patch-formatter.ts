import { WorkingDirectoryFileChange } from '../models/status'
import { DiffLineType, Diff, DiffHunk, DiffSelection } from '../models/diff'

function extractAdditionalText(hunkHeader: string): string {
  const additionalTextIndex = hunkHeader.lastIndexOf('@@')

  // guard against being sent only one instance of @@ in the text
  if (additionalTextIndex <= 0) {
    return ''
  }

  // return everything after the found '@@'
  return hunkHeader.substring(additionalTextIndex + 2)
}

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
  afterText: string) {

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

    return `@@ -${lineInfoBefore} +${lineInfoAfter} @@${afterText}\n`
}

// Lower and upper inclusive
function anyLinesSelectedInHunk(selection: DiffSelection, hunk: DiffHunk) {
  return hunk.lines.some((line, index) => {
    if (line.type === DiffLineType.Context || line.type === DiffLineType.Hunk) { return false }
    return selection.isSelected(hunk.unifiedDiffStart + index)
  })
}

export function createPatchForModifiedFile(file: WorkingDirectoryFileChange, diff: Diff): string {
  const selection = file.selection

  let input = ''

  diff.hunks.forEach(hunk => {

    let linesSkipped = 0
    let linesIncluded = 0
    let linesRemoved = 0
    let patchBody = ''

    // don't generate a patch if no lines are selected
    if (!anyLinesSelectedInHunk(selection, hunk)) {
      return
    }

    hunk.lines
      .forEach((line, index) => {
        if (line.type === DiffLineType.Hunk) {
          // ignore the header
          return
        }

        if (line.type === DiffLineType.Context) {
          patchBody += line.text + '\n'
          return
        }

        const absoluteIndex = hunk.unifiedDiffStart + index
        if (selection.isSelected(absoluteIndex)) {
          patchBody += line.text + '\n'
          if (line.type === DiffLineType.Add) {
            linesIncluded += 1
          } else if (line.type === DiffLineType.Delete) {
            linesRemoved += 1
          }
        } else if (line.type === DiffLineType.Delete) {
          // need to generate the correct patch here
          patchBody += ' ' + line.text.substr(1, line.text.length - 1) + '\n'
          linesSkipped -= 1
        } else {
          // ignore this line when creating the patch
          linesSkipped += 1
          // and for subsequent patches
        }
      })

    const header = hunk.lines[0]
    const additionalText = extractAdditionalText(header.text)
    const beforeStart = hunk.header.oldStartLine
    const beforeCount = hunk.header.oldLineCount
    const afterStart = hunk.header.newStartLine

    // TODO: HERE BE DRAGONS
    //
    // Due to a bug in the original implementation of the diff parser
    // all omitted line counts were treates as NaN and NaN plus NaN
    // is always NaN so up until the diff parser refactor afterCount
    // was always NaN. I'm making it so again so that we can get the
    // parser merged and then we can come back and refactor patch
    // formatter and I can go get started on dinner.
    //
    // niik 2016-09-28
    const afterCount = hunk.header.newLineCount === 1
      ? NaN
      : hunk.header.newLineCount + linesSkipped
    //const afterCount = s.header.newLineCount + linesSkipped

    const hunkHeader = formatHunkHeader(
      beforeStart,
      beforeCount,
      afterStart,
      afterCount,
      additionalText)

      input += hunkHeader + patchBody
  })

  const patchHeader = formatPatchHeader(
    file.path,
    file.path)

  input = patchHeader + input

  return input
}


export function createPatchForNewFile(file: WorkingDirectoryFileChange, diff: Diff): string {
  const selection = file.selection
  let input = ''

  diff.hunks.map(hunk => {

    let linesCounted: number = 0
    let patchBody: string = ''

    hunk.lines
      .forEach((line, index) => {
        if (line.type === DiffLineType.Hunk) {
          // ignore the header
          return
        }

        if (line.type === DiffLineType.Context) {
          patchBody += line.text + '\n'
          return
        }

        // TODO: This was straigh off converted from the old
        // Map to DiffSelection but I'm almost certain it's wrong.
        // I don't think index here means what the author intended
        // it to mean.
        //
        // - @niik
        if (selection.isSelected(index)) {
          patchBody += line.text + '\n'
          linesCounted += 1
        }
      })

    const header = hunk.lines[0]
    const additionalText = extractAdditionalText(header.text)

    const hunkHeader = formatHunkHeader(
      hunk.header.oldStartLine,
      hunk.header.oldLineCount,
      hunk.header.newStartLine,
      linesCounted,
      additionalText
    )

    input += hunkHeader + patchBody
  })

  const patchHeader = formatPatchHeader(
    null,
    file.path)

  input = patchHeader + input

  return input
}

export function createPatchForDeletedFile(file: WorkingDirectoryFileChange, diff: Diff): string {
  const selection = file.selection
  let input = ''
  let linesIncluded = 0

  diff.hunks.map(hunk => {

    let patchBody: string = ''

    hunk.lines
      .forEach((line, index) => {
        if (line.type === DiffLineType.Hunk) {
          // ignore the header
          return
        }

        if (line.type === DiffLineType.Context) {
          patchBody += line.text + '\n'
          return
        }

        // TODO: This was straigh off converted from the old
        // Map to DiffSelection but I'm almost certain it's wrong.
        // I don't think index here means what the author intended
        // it to mean.
        //
        // - @niik
        const include = selection.isSelected(index)
        if (include) {
          patchBody += line.text + '\n'
          linesIncluded += 1
        } else {
          patchBody += ' ' + line.text.substr(1, line.text.length - 1) + '\n'
        }
      })

    const header = hunk.lines[0]
    const additionalText = extractAdditionalText(header.text)

    const remainingLines = hunk.header.oldLineCount - linesIncluded

    const hunkHeader = formatHunkHeader(
      hunk.header.oldStartLine,
      hunk.header.oldLineCount,
      1,
      remainingLines,
      additionalText
    )

    input += hunkHeader + patchBody
  })

  const patchHeader = formatPatchHeader(
    file.path,
    file.path)

  input = patchHeader + input

  return input
}
