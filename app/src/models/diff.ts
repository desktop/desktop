import { assertNever } from '../lib/fatal-error'

export enum DiffType {
  /** changes to a text file, which may be partially selected for commit */
  Text,
  /** changes to files of a known format, which can be viewed in the app */
  Image,
  /** changes to an unknown file format, which Git is unable to present in a human-friendly format */
  Binary,
  /** change to a repository which is included as a submodule of this repository */
  Submodule,
}

/** indicate what a line in the diff represents */
export enum DiffLineType {
  Context, Add, Delete, Hunk,
}


export interface ITextDiff {
  readonly kind: DiffType.Text
  /** The unified text diff - including headers and context */
  readonly text: string
  /** The diff contents organized by hunk - how the git CLI outputs to the caller */
  readonly hunks: ReadonlyArray<DiffHunk>
}

export interface IImageDiff {
  readonly kind: DiffType.Image
  /**
   * The previous image, if the file was modified or deleted
   *
   * Will be undefined for an added image
   */
  readonly previous?: Image
  /**
   * The current image, if the file was added or modified
   *
   * Will be undefined for a deleted image
   */
  readonly current?: Image
}

export interface IBinaryDiff {
  readonly kind: DiffType.Binary
}

/** The union of diff types that can be rendered in Desktop */
export type IDiff =
  ITextDiff |
  IImageDiff |
  IBinaryDiff

/** track details related to each line in the diff */
export class DiffLine {
  public readonly text: string
  public readonly type: DiffLineType
  public readonly oldLineNumber: number | null
  public readonly newLineNumber: number | null
  public readonly noTrailingNewLine: boolean

  public constructor(text: string, type: DiffLineType, oldLineNumber: number | null, newLineNuber: number | null, noTrailingNewLine: boolean = false) {
    this.text = text
    this.type = type
    this.oldLineNumber = oldLineNumber
    this.newLineNumber = newLineNuber
    this.noTrailingNewLine = noTrailingNewLine
  }

  public withNoTrailingNewLine(noTrailingNewLine: boolean): DiffLine {
    return new DiffLine(this.text, this.type, this.oldLineNumber, this.newLineNumber, noTrailingNewLine)
  }

  public isIncludeableLine() {
    return this.type === DiffLineType.Add || this.type === DiffLineType.Delete
  }
}

/** details about the start and end of a diff hunk */
export class DiffHunkHeader {
  /** The line in the old (or original) file where this diff hunk starts */
  public readonly oldStartLine: number

  /** The number of lines in the old (or original) file that this diff hunk covers */
  public readonly oldLineCount: number

  /** The line in the new file where this diff hunk starts */
  public readonly newStartLine: number

  /** The number of lines in the new file that this diff hunk covers */
  public readonly newLineCount: number

  public constructor(oldStartLine: number, oldLineCount: number, newStartLine: number, newLineCount: number, sectionHeading?: string | null) {
    this.oldStartLine = oldStartLine
    this.oldLineCount = oldLineCount
    this.newStartLine = newStartLine
    this.newLineCount = newLineCount
  }
}

/** each diff is made up of a number of hunks */
export class DiffHunk {
  /** details from the diff hunk header about the line start and patch length */
  public readonly header: DiffHunkHeader
  /** the contents - context and changes - of the diff setion */
  public readonly lines: ReadonlyArray<DiffLine>
  /** the diff hunk's start position in the overall file diff */
  public readonly unifiedDiffStart: number
  /** the diff hunk's end position in the overall file diff */
  public readonly unifiedDiffEnd: number

  public constructor(header: DiffHunkHeader, lines: ReadonlyArray<DiffLine>, unifiedDiffStart: number, unifiedDiffEnd: number) {
    this.header = header
    this.unifiedDiffStart = unifiedDiffStart
    this.unifiedDiffEnd = unifiedDiffEnd
    this.lines = lines
  }
}

/**
 * A container for holding an image for display in the application
 */
export class Image {

  /**
   * The base64 encoded contents of the image
   */
  public readonly contents: string

  /**
   * The data URI media type, so the browser can render the image correctly
   */
  public readonly mediaType: string
}

export class FileSummary {
  /**
   * The number of lines added as part of this change.
   *
   * If the file is a binary change, this value is undefined.
   */
  public readonly added?: number
  /**
   * The number of lines removed as part of this change.
   *
   * If the file is a binary change, this value is undefined.
   */
  public readonly removed?: number

  /**
   * The path to this change, relative to the submodule root
   */
  public readonly path: string

  public constructor(path: string, added: number | undefined, removed: number | undefined) {
    this.path = path
    this.added = added
    this.removed = removed
  }

  /** An ID for the file change. */
  public get id(): string {
    return `${this.added}+${this.removed}+${this.path}`
  }
}

/** the contents of a diff generated by Git */
export interface IRawDiff {
  /**
   * The plain text contents of the diff header. This contains
   * everything from the start of the diff up until the first
   * hunk header starts. Note that this does not include a trailing
   * newline.
   */
  readonly header: string

  /**
   * The plain text contents of the diff. This contains everything
   * after the diff header until the last character in the diff.
   *
   * Note that this does not include a trailing newline nor does
   * it include diff 'no newline at end of file' comments. For
   * no-newline information, consult the DiffLine noTrailingNewLine
   * property.
   */
  readonly contents: string

  /**
   * Each hunk in the diff with information about start, and end
   * positions, lines and line statuses.
   */
  readonly hunks: ReadonlyArray<DiffHunk>

  /**
   * Whether or not the unified diff indicates that the contents
   * could not be diffed due to one of the versions being binary.
   */
  readonly isBinary: boolean
}

export enum DiffSelectionType {
  All,
  Partial,
  None,
}

/**
 * Utility function which determines whether a boolean selection state
 * matches the given DiffSelectionType. A true selection state matches
 * DiffSelectionType.All, a false selection state matches
 * DiffSelectionType.None and if the selection type is partial there's
 * never a match.
 */
function typeMatchesSelection(selectionType: DiffSelectionType, selected: boolean): boolean {
  switch (selectionType) {
    case DiffSelectionType.All: return selected
    case DiffSelectionType.None: return !selected
    case DiffSelectionType.Partial: return false
    default:
      return assertNever(selectionType, `Unknown selection type ${selectionType}`)
  }
}

/**
 * An immutable, efficient, storage object for tracking selections of indexable
 * lines. While general purpose by design this is currently used exclusively for
 * tracking selected lines in modified files in the working directory.
 *
 * This class starts out with an initial (or default) selection state, ie
 * either all lines are selected by default or no lines are selected by default.
 *
 * The selection can then be transformed by marking a line or a range of lines
 * as selected or not selected. Internally the class maintains a list of lines
 * whose selection state has diverged from the default selection state.
 */
export class DiffSelection {

  private readonly defaultSelectionType: DiffSelectionType.All | DiffSelectionType.None

  /* Any line numbers where the selection differs from the default state. */
  private readonly divergingLines: Set<number> | null

  /* Optional set of line numbers which can be selected. */
  private readonly selectableLines: Set<number> | null

  /**
   * Initialize a new selection instance where either all lines are selected by default
   * or not lines are selected by default.
   */
  public static fromInitialSelection(initialSelection: DiffSelectionType.All | DiffSelectionType.None): DiffSelection {

    if (initialSelection !== DiffSelectionType.All && initialSelection !== DiffSelectionType.None) {
      return assertNever(initialSelection, 'Can only instantiate a DiffSelection with All or None as the initial selection')
    }

    return new DiffSelection(initialSelection, null, null)
  }

  private constructor(defaultSelectionType: DiffSelectionType.All | DiffSelectionType.None, divergingLines: Set<number> | null, selectableLines: Set<number> | null) {
    this.defaultSelectionType = defaultSelectionType
    this.divergingLines = divergingLines || null
    this.selectableLines = selectableLines || null
  }

  /** Returns a value indicating the computed overall state of the selection */
  public getSelectionType(): DiffSelectionType {
    const divergingLines = this.divergingLines
    const selectableLines = this.selectableLines

    // No diverging lines, happy path. Either all lines are selected or none are.
    if (!divergingLines) { return this.defaultSelectionType }
    if (divergingLines.size === 0) { return this.defaultSelectionType }

    // If we know which lines are selectable we need to check that
    // all lines are divergent and return the inverse of default selection.
    // To avoid loopting through the set that often our happy path is
    // if there's a size mismatch.
    if (selectableLines && selectableLines.size === divergingLines.size) {
      const allSelectableLinesAreDivergent = [ ...selectableLines ]
        .every(i => divergingLines.has(i))

      if (allSelectableLinesAreDivergent) {
        return this.defaultSelectionType === DiffSelectionType.All
          ? DiffSelectionType.None
          : DiffSelectionType.All
      }
    }

    // Note that without any selectable lines we'll report partial selection
    // as long as we have any diverging lines since we have no way of knowing
    // if _all_ lines are divergent or not
    return DiffSelectionType.Partial
  }

  /** Returns a value indicating wether the given line number is selected or not */
  public isSelected(lineIndex: number): boolean {
    const lineIsDivergent = !!this.divergingLines && this.divergingLines.has(lineIndex)

    if (this.defaultSelectionType === DiffSelectionType.All) {
      return !lineIsDivergent
    } else if (this.defaultSelectionType === DiffSelectionType.None) {
      return lineIsDivergent
    } else {
      return assertNever(this.defaultSelectionType, `Unknown base selection type ${this.defaultSelectionType}`)
    }
  }

  /**
   * Returns a value indicating wether the given line number is selectable.
   * A line not being selectable usually means it's a hunk header or a context
   * line.
   */
  public isSelectable(lineIndex: number): boolean {
    return this.selectableLines
      ? this.selectableLines.has(lineIndex)
      : true
  }

  /**
   * Returns a copy of this selection instance with the provided
   * line selection update.
   *
   * @param lineIndex The index (line number) of the line which should
   *                 be selected or unselected.
   *
   * @param selected Whether the given line number should be marked
   *                 as selected or not.
   */
  public withLineSelection(lineIndex: number, selected: boolean): DiffSelection {
    return this.withRangeSelection(lineIndex, 1, selected)
  }


  /**
   * Returns a copy of this selection instance with the provided
   * line selection update. This is similar to the withLineSelection
   * method except that it allows updating the selection state of
   * a range of lines at once. Use this if you ever need to modify
   * the selection state of more than one line at a time as it's
   * more efficient.
   *
   * @param from     The line index (inclusive) from where to start
   *                 updating the line selection state.
   *
   * @param to       The number of lines for which to update the
   *                 selection state. A value of zero means no lines
   *                 are updated and a value of 1 means only the
   *                 line given by lineIndex will be updated.
   *
   * @param selected Whether the lines should be marked as selected
   *                 or not.
   */
  // Lower inclusive, upper exclusive. Same as substring
  public withRangeSelection(from: number, length: number, selected: boolean): DiffSelection {
    const computedSelectionType = this.getSelectionType()
    const to = from + length

    // Nothing for us to do here. This state is when all lines are already
    // selected and we're being asked to select more or when no lines are
    // selected and we're being asked to unselect something.
    if (typeMatchesSelection(computedSelectionType, selected)) {
       return this
    }

    if (computedSelectionType === DiffSelectionType.Partial) {
      const newDivergingLines = new Set<number>(this.divergingLines!)

      if (typeMatchesSelection(this.defaultSelectionType, selected)) {
        for (let i = from; i < to; i++) {
          newDivergingLines.delete(i)
        }
      } else {
        for (let i = from; i < to; i++) {
          // Ensure it's selectable
          if (this.isSelectable(i)) {
            newDivergingLines.add(i)
          }
        }
      }

      return new DiffSelection(this.defaultSelectionType, newDivergingLines.size === 0 ? null : newDivergingLines, this.selectableLines)
    } else {
      const newDivergingLines = new Set<number>()
      for (let i = from; i < to; i++) {
        if (this.isSelectable(i)) {
          newDivergingLines.add(i)
        }
      }

      return new DiffSelection(computedSelectionType, newDivergingLines, this.selectableLines)
    }
  }

  /**
   * Returns a copy of this selection instance where the selection state
   * of the specified line has been toggled (inverted).
   *
   * @param lineIndex The index (line number) of the line which should
   *                 be selected or unselected.
   */
  public withToggleLineSelection(lineIndex: number): DiffSelection {
    return this.withLineSelection(lineIndex, !this.isSelected(lineIndex))
  }

  /**
   * Returns a copy of this selection instance with all lines selected.
   */
  public withSelectAll(): DiffSelection {
    return new DiffSelection(DiffSelectionType.All, null, this.selectableLines)
  }

  /**
   * Returns a copy of this selection instance with no lines selected.
   */
  public withSelectNone(): DiffSelection {
    return new DiffSelection(DiffSelectionType.None, null, this.selectableLines)
  }

  /**
   * Returns a copy of this selection instance with a specified set of
   * selecable lines. By default a DiffSelection instance allows selecting
   * all lines (in fact, it has no notion of how many lines exists or what
   * it is that is being selected).
   *
   * If the selection instance lacks a set of selectable lines it can not
   * supply an accurate value from getSelectionType when the selection of
   * all lines have diverged from the default state (since it doesn't know
   * what all lines mean).
   */
  public withSelectableLines(selectableLines: Set<number>) {
    const divergingLines = this.divergingLines
      ? new Set([ ...this.divergingLines ].filter(x => selectableLines.has(x)))
      : null

    return new DiffSelection(this.defaultSelectionType, divergingLines, selectableLines)
  }
}
