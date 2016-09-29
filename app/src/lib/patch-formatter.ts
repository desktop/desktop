import { WorkingDirectoryFileChange } from '../models/status'
import { DiffLineType, Diff } from '../models/diff'

function extractAdditionalText(hunkHeader: string): string {
  const additionalTextIndex = hunkHeader.lastIndexOf('@@')

  // guard against being sent only one instance of @@ in the text
  if (additionalTextIndex <= 0) {
    return ''
  }

  // return everything after the found '@@'
  return hunkHeader.substring(additionalTextIndex + 2)
}

function formatPatchHeader(
  from: string | null,
  to: string | null,
  beforeStart: number,
  beforeLength: number,
  afterStart: number,
  afterLength: number,
  afterText: string
): string {

  const fromText = from ? `a/${from}` : '/dev/null'
  const toText = to ? `b/${to}` : '/dev/null'

  return `--- ${fromText}\n+++ ${toText}\n@@ -${beforeStart},${beforeLength} +${afterStart},${afterLength} @@${afterText}\n`
}

export function createPatchForModifiedFile(file: WorkingDirectoryFileChange, diff: Diff): string {
  const selection = file.selection.selectedLines
  const selectedLinesArray = Array.from(selection)

  let globalLinesSkipped = 0

  let input = ''

  diff.sections.forEach(s => {

    let linesSkipped = 0
    let linesIncluded = 0
    let linesRemoved = 0
    let patchBody = ''

    const selectedLines = selectedLinesArray.filter(a => a[0] >= s.unifiedDiffStart && a[0] <= s.unifiedDiffEnd)

    // don't generate a patch if no lines are selected
    if (selectedLines.every(l => l[1] === false)) {
      globalLinesSkipped += selectedLines.length
      return
    }

    s.lines
      .forEach((line, index) => {
        if (line.type === DiffLineType.Hunk) {
          // ignore the header
          return
        }

        if (line.type === DiffLineType.Context) {
          patchBody += line.text + '\n'
          return
        }

        const absoluteIndex = s.unifiedDiffStart + index
        if (selection.get(absoluteIndex)) {
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
          globalLinesSkipped -= 1
        } else {
          // ignore this line when creating the patch
          linesSkipped += 1
          // and for subsequent patches
          globalLinesSkipped += 1
        }
      })

    const header = s.lines[0]
    const additionalText = extractAdditionalText(header.text)
    const beforeStart = s.header.oldStartLine
    const beforeCount = s.header.oldLineCount
    const afterStart = s.header.newStartLine

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
    const afterCount = s.header.newLineCount === 1
      ? NaN
      : s.header.newLineCount + linesSkipped
    //const afterCount = s.header.newLineCount + linesSkipped

    const patchHeader = formatPatchHeader(
      file.path,
      file.path,
      beforeStart,
      beforeCount,
      afterStart,
      afterCount,
      additionalText)

      input += patchHeader + patchBody
  })

  return input
}


export function createPatchForNewFile(file: WorkingDirectoryFileChange, diff: Diff): string {
  const selection = file.selection.selectedLines
  let input = ''

  diff.sections.map(s => {

    let linesCounted: number = 0
    let patchBody: string = ''

    s.lines
      .forEach((line, index) => {
        if (line.type === DiffLineType.Hunk) {
          // ignore the header
          return
        }

        if (line.type === DiffLineType.Context) {
          patchBody += line.text + '\n'
          return
        }

        if (selection.has(index)) {
          const include = selection.get(index)
          if (include) {
            patchBody += line.text + '\n'
            linesCounted += 1
          }
        }
      })

    const header = s.lines[0]
    const additionalText = extractAdditionalText(header.text)

    const patchHeader = formatPatchHeader(
      null,
      file.path,
      s.header.oldStartLine,
      s.header.oldLineCount,
      s.header.newStartLine,
      linesCounted,
      additionalText)

    input += patchHeader + patchBody
  })

  return input
}

export function createPatchForDeletedFile(file: WorkingDirectoryFileChange, diff: Diff): string {
  const selection = file.selection.selectedLines
  let input = ''
  let linesIncluded = 0

  diff.sections.map(s => {

    let patchBody: string = ''

    s.lines
      .forEach((line, index) => {
        if (line.type === DiffLineType.Hunk) {
          // ignore the header
          return
        }

        if (line.type === DiffLineType.Context) {
          patchBody += line.text + '\n'
          return
        }

        if (selection.has(index)) {
          const include = selection.get(index)
          if (include) {
            patchBody += line.text + '\n'
            linesIncluded += 1
          } else {
            patchBody += ' ' + line.text.substr(1, line.text.length - 1) + '\n'
          }
        } else {
          patchBody += ' ' + line.text.substr(1, line.text.length - 1) + '\n'
        }
      })

    const header = s.lines[0]
    const additionalText = extractAdditionalText(header.text)

    const remainingLines = s.header.oldLineCount - linesIncluded

    const patchHeader = formatPatchHeader(
      file.path,
      file.path,
      s.header.oldStartLine,
      s.header.oldLineCount,
      1,
      remainingLines,
      additionalText)

    input += patchHeader + patchBody
  })

  return input
}
