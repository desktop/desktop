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

export function createPatchesForModifiedFile(file: WorkingDirectoryFileChange, diff: Diff): ReadonlyArray<string | undefined> {
  const selection = file.selection.selectedLines

  let globalLinesSkipped = 0

  return diff.sections.map(s => {

    let linesSkipped = 0
    let linesIncluded = 0
    let linesRemoved = 0
    let patchBody = ''

    const selectedLinesArray = Array.from(file.selection.selectedLines)

    const selectedLines = selectedLinesArray.filter(a => a[0] >= s.unifiedDiffStart && a[0] < s.unifiedDiffEnd)

    if (selectedLines.every(l => l[1] === false)) {
      globalLinesSkipped += selectedLines.length
      return undefined
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
        if (selection.has(absoluteIndex)) {
          const include = selection.get(absoluteIndex)
          if (include) {
            patchBody += line.text + '\n'
            if (line.type === DiffLineType.Add) {
              linesIncluded += 1
            } else if (line.type === DiffLineType.Delete) {
              linesRemoved += 1
            }
          }
          return
        }

        if (line.type === DiffLineType.Delete) {
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
    const beforeStart = s.range.oldStartLine
    const beforeEnd = s.range.oldEndLine
    const afterStart = s.range.newStartLine - globalLinesSkipped + linesIncluded
    const afterEnd = s.range.oldEndLine - linesSkipped - linesRemoved + globalLinesSkipped

    const patchHeader = formatPatchHeader(
      file.path,
      file.path,
      beforeStart,
      beforeEnd,
      afterStart,
      afterEnd,
      additionalText)

    return patchHeader + patchBody
  })
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
      s.range.oldStartLine,
      s.range.oldEndLine,
      s.range.newStartLine,
      linesCounted,
      additionalText)

    input += patchHeader + patchBody
  })

  return input
}
