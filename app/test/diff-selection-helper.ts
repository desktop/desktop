import { Diff, DiffLineType } from '../src/models/diff'

export function selectLinesInSection(diff: Diff, index: number, selected: boolean): Map<number, boolean> {

    const selectedLines = new Map<number, boolean>()

    const section = diff.sections[index]
    section.lines.forEach((line, index) => {
      if (line.type === DiffLineType.Context || line.type === DiffLineType.Hunk) {
        return
      }

      const absoluteIndex = section.unifiedDiffStart + index
      selectedLines.set(absoluteIndex, selected)
    })

    return selectedLines
}

export function mergeSelections(array: ReadonlyArray<Map<number, boolean>>): Map<number, boolean> {
  const selectedLines = new Map<number, boolean>()

  for (let i = 0; i < array.length; i++) {
    const a = array[i]
    for (const v of a.entries()) {
      selectedLines.set(v[0], v[1])
    }
  }

  return selectedLines
}
