import { Diff, DiffSection, DiffSectionRange } from '../models/diff'

export function parseRawDiff(lines: string[]): Diff {

    const sectionRegex = /^@@ -(\d+)(,+(\d+))? \+(\d+)(,(\d+))? @@ ?(.*)$/m
    const regexGroups = { oldFileStart: 1, oldFileEnd: 3, newFileStart: 4, newFileEnd: 6 }

    const diffText = lines[lines.length - 1]

    const diffSections = new Array<DiffSection>()

    // track the remaining text in the raw diff to parse
    let diffTextBuffer = diffText
    // each diff section starts with these two characters
    let sectionPrefixIndex = diffTextBuffer.indexOf('@@')
    // continue to iterate while these sections exist
    let prefixFound = sectionPrefixIndex > -1

    let pointer: number = 0

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

      // add new section based on the remaining text in the raw diff
      if (prefixFound) {
        const diffBody = diffTextBuffer.substr(0, sectionPrefixIndex)

        let startDiffSection: number = 0
        let endDiffSection: number = 0

        const diffLines = diffBody.split('\n')

        if (diffSections.length === 0) {
          startDiffSection = 0
          endDiffSection = diffLines.length
        } else {
          startDiffSection = pointer + 1
          endDiffSection = startDiffSection + diffLines.length
        }

        pointer += diffLines.length

        diffSections.push(new DiffSection(range, diffLines, startDiffSection, endDiffSection))
      } else {
        const diffBody = diffTextBuffer

        let startDiffSection: number = 0
        let endDiffSection: number = 0

        const diffLines = diffBody.split('\n')

        if (diffSections.length === 0) {
          startDiffSection = 0
          endDiffSection = diffLines.length
        } else {
          startDiffSection = pointer
          endDiffSection = startDiffSection + diffLines.length
        }

        diffSections.push(new DiffSection(range, diffLines, startDiffSection, endDiffSection))
      }
    }

    return new Diff(diffSections)
}
