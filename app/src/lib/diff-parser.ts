import { Diff, DiffSection, DiffSectionRange } from '../models/diff'

/**
 * Attempts to convert a RegExp capture group into a number.
 */
function numberFromGroup(m: RegExpMatchArray, group: number): number {
  const str = m[group]
  return parseInt(str, 10)
}

// https://en.wikipedia.org/wiki/Diff_utility
//
// @@ -l,s +l,s @@ optional section heading
//
// The hunk range information contains two hunk ranges. The range for the hunk of the original
// file is preceded by a minus symbol, and the range for the new file is preceded by a plus
// symbol. Each hunk range is of the format l,s where l is the starting line number and s is
// the number of lines the change hunk applies to for each respective file.
const diffHeaderRe = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

function parseDiffHeader(line: string): DiffSectionRange {
  const m = diffHeaderRe.exec(line)
  if (!m) { throw new Error('') }

  const oldStartLine = numberFromGroup(m, 1)
  const oldEndLine = numberFromGroup(m, 2)
  const newStartLine = numberFromGroup(m, 3)
  const newEndLine = numberFromGroup(m, 4)

  return new DiffSectionRange(oldStartLine, oldEndLine, newStartLine, newEndLine)
}

export function parseRawDiff(diffText: string): Diff {

    let ls = 0
    let le = diffText.indexOf('\n')
    let hasSeenDiffPreText = false
    let diffSectionHeader: DiffSectionRange | null = null
    let numberOfUnifiedDiffLines = 0

    const diffSections = new Array<DiffSection>()
    let diffLines = new Array<string>()

    while (le !== -1 && ls < diffText.length) {

      if (!hasSeenDiffPreText) {
        if (diffText.startsWith('+++', ls)) {
          hasSeenDiffPreText = true
        }
      } else {
        // is inhunk
        if (diffSectionHeader == null) {
          const line = diffText.substring(ls, le)
          diffSectionHeader = parseDiffHeader(line)
          diffLines.push(line)
        } else {
          const c = diffText[ls]
          if (c === '+' || c === '-' || c === ' ') {
            diffLines.push(diffText.substring(ls, le))
          } else {
            if (diffText.startsWith('@@', ls)) {

              // add new section based on the remaining text in the raw diff
              let startDiffSection: number = 0
              let endDiffSection: number = 0

              if (diffSections.length === 0) {
                startDiffSection = 0
                endDiffSection = diffLines.length - 1
              } else {
                startDiffSection = numberOfUnifiedDiffLines
                endDiffSection = startDiffSection + diffLines.length - 1
              }

              numberOfUnifiedDiffLines += diffLines.length

              diffSections.push(new DiffSection(diffSectionHeader, diffLines, startDiffSection, endDiffSection))

              diffSectionHeader = null
              diffLines = new Array<string>()
              continue
            } else {
              throw new Error('')
            }
          }
        }
      }

      ls = le + 1
      le = diffText.indexOf('\n', ls)
    }

    if (diffLines.length > 0 && diffSectionHeader != null) {

      // add new section based on the remaining text in the raw diff
      let startDiffSection: number = 0
      let endDiffSection: number = 0

      if (diffSections.length === 0) {
        startDiffSection = 0
        endDiffSection = diffLines.length - 1
      } else {
        startDiffSection = numberOfUnifiedDiffLines
        endDiffSection = startDiffSection + diffLines.length - 1
      }

      diffSections.push(new DiffSection(diffSectionHeader, diffLines, startDiffSection, endDiffSection))
    }

    return new Diff(diffSections)
}
