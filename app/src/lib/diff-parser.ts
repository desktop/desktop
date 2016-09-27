import { Diff, DiffSection, DiffSectionRange } from '../models/diff'

export function parseRawDiff(diffText: string): Diff {

    // https://en.wikipedia.org/wiki/Diff_utility
    //
    // @@ -l,s +l,s @@ optional section heading
    // The hunk range information contains two hunk ranges. The range for the hunk of the original
    // file is preceded by a minus symbol, and the range for the new file is preceded by a plus
    // symbol. Each hunk range is of the format l,s where l is the starting line number and s is
    // the number of lines the change hunk applies to for each respective file.
    const sectionRegex = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/m
    const regexGroups = { oldFileStart: 1, oldFileEnd: 2, newFileStart: 3, newFileEnd: 4 }

    const diffSections = new Array<DiffSection>()

    // track the remaining text in the raw diff to parse
    let diffTextBuffer = diffText
    // each diff section starts with these two characters
    let sectionPrefixIndex = diffTextBuffer.indexOf('@@')
    // continue to iterate while these sections exist
    let prefixFound = sectionPrefixIndex > -1

    let numberOfUnifiedDiffLines = 0

    while (prefixFound) {

      // trim any preceding text
      diffTextBuffer = diffTextBuffer.substr(sectionPrefixIndex)

      // extract the diff section numbers
      const match = sectionRegex.exec(diffTextBuffer)

      let oldStartLine: number = -1
      let oldEndLine: number = -1
      let newStartLine: number = -1
      let newEndLine: number = -1

      if (match) {
        const first = match[regexGroups.oldFileStart]
        oldStartLine = parseInt(first, 10)
        const second = match[regexGroups.oldFileEnd]
        oldEndLine = parseInt(second, 10)
        const third = match[regexGroups.newFileStart]
        newStartLine = parseInt(third, 10)
        const fourth = match[regexGroups.newFileEnd]
        newEndLine = parseInt(fourth, 10)
      }

      const range = new DiffSectionRange(oldStartLine, oldEndLine, newStartLine, newEndLine)

      // re-evaluate whether other sections exist to parse
      const endOfThisLine = diffTextBuffer.indexOf('\n')
      sectionPrefixIndex = diffTextBuffer.indexOf('@@', endOfThisLine + 1)
      prefixFound = sectionPrefixIndex > -1

      const diffBody = prefixFound
        ? diffTextBuffer.substr(0, sectionPrefixIndex)
        : diffTextBuffer

      // add new section based on the remaining text in the raw diff
      let startDiffSection: number = 0
      let endDiffSection: number = 0

      const diffLines = diffBody.split('\n')
      // Remove the trailing empty line
      diffLines.pop()

      if (diffSections.length === 0) {
        startDiffSection = 0
        endDiffSection = diffLines.length - 1
      } else {
        startDiffSection = numberOfUnifiedDiffLines
        endDiffSection = startDiffSection + diffLines.length - 1
      }

      numberOfUnifiedDiffLines += diffLines.length

      diffSections.push(new DiffSection(range, diffLines, startDiffSection, endDiffSection))
    }

    return new Diff(diffSections)
}
