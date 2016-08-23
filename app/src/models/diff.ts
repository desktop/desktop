
export enum DiffSelectionType {
  All,
  Partial,
  None
}

export class DiffSelectionParser {
  /** iterate over the selected values and determine the all/none state  */
  private static parse(selection: Map<number, boolean>): { allSelected: boolean, noneSelected: boolean } {
      const toArray = Array.from(selection.values())

      const allSelected = toArray.every(k => k === true)
      const noneSelected = toArray.every(k => k === false)

      return { allSelected, noneSelected }
  }

  /** determine the selection state based on the selected lines */
  public static getState(selection: Map<number, boolean>): DiffSelectionType {
    const { allSelected, noneSelected } = DiffSelectionParser.parse(selection)

    if (allSelected) {
      return DiffSelectionType.All
    } else if (noneSelected) {
      return DiffSelectionType.None
    }

    return  DiffSelectionType.Partial
  }
}


/** encapsulate the selection of changes to a modified file in the working directory  */
export class DiffSelection {

  /** by default, the diff selection to include all lines */
  private readonly include: DiffSelectionType = DiffSelectionType.All

  /**
      once the user has started selecting specific lines to include,
      these selections are tracked here - the key corresponds to the index
      in the unified diff, and the value indicates whether the line has been
      selected

      TODO: there's an impedance mismatch here between the diff hunk, which
            each have indexes relative to themselves and might not be unique,
            and the user selecting a line, which need to be unique. Pondering
            on a better way to represent this...
  */
  public readonly selectedLines: Map<number, boolean>

  public constructor(include: DiffSelectionType, selectedLines: Map<number, boolean>) {
    this.include = include
    this.selectedLines = selectedLines
  }

  /**  return the current state of the diff selection */
  public getSelectionType(): DiffSelectionType {
    if (this.selectedLines.size === 0) {
      return this.include
    } else {
      return DiffSelectionParser.getState(this.selectedLines)
    }
  }
}
