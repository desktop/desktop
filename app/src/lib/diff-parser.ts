import { Diff, DiffSection, DiffSectionRange } from '../models/diff'

/**
 * Attempts to convert a RegExp capture group into a number.
 * If the group doesn't exist, wasn't captured or if the captured
 * string can't be converted to a number this will return NaN
 *
 * @TODO Determine if NaN is really what we want, it feels very
 *       wrong but this refactor is big enough as it is.
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

const prefixAdd = '+'
const prefixDelete = '-'
const prefixContext = ' '

export class DiffParser {

  /**
   * Line start pointer.
   *
   * The offset into the text property where the current line starts (ie either zero
   * or one character ahead of the last newline character).
   */
  private ls: number

  /**
   * Line end pointer.
   *
   * The offset into the text property where the current line ends (ie it points to
   * the newline character) or -1 if the line boundary hasn't been determined yet
   */
  private le: number

  /**
   * The text buffer containing the raw, unified diff output to be parsed
   */
  private text: string

  public constructor() {
    this.reset()
  }

  /**
   * Resets the internal parser state so that it can be reused.
   *
   * This is done automatically at the end of each parse run.
   */
  private reset() {
    this.ls = 0
    this.le = -1
    this.text = ''
  }

  /**
   * Aligns the internal character pointers at the boundaries of
   * the next line.
   *
   * Returns true if successful or false if the end of the diff
   * has been reached.
   */
  private nextLine(): boolean {
    this.ls = this.le + 1

    // We've reached the end of the diff
    if (this.ls >= this.text.length) {
      return false
    }

    this.le = this.text.indexOf('\n', this.ls)

    // If we can't find the next newline character we'll put our
    // end pointer at the end of the diff string
    if (this.le === -1) {
      this.le = this.text.length
    }

    // We've succeeded if there's anything to read in between the
    // start and the end
    return this.ls !== this.le
  }

  /**
   * Advances to the next line and returns it as a substring
   * of the raw diff text. Returns null if end of diff was
   * reached.
   */
  private readLine(): string | null {
    return this.nextLine()
      ? this.text.substring(this.ls, this.le)
      : null
  }

  /** Tests if the current line starts with the given search text */
  private lineStartsWith(searchString: string): boolean {
    return this.text.startsWith(searchString, this.ls)
  }

  /**
   * Returns the starting character of the next line without
   * advancing the internal state. Returns null if advancing
   * would mean reaching the end of the diff.
   */
  private peek(): string | null {
    const p = this.le + 1
    return p < this.text.length ? this.text[p] : null
  }

  /**
   * Scan past the diff header, meaning everything from the
   * start of the diff output to the end of the line beginning
   * with ---
   *
   * Example diff header:
   *
   * diff --git a/app/src/lib/diff-parser.ts b/app/src/lib/diff-parser.ts
   * index e1d4871..3bd3ee0 100644
   * --- a/app/src/lib/diff-parser.ts
   * +++ b/app/src/lib/diff-parser.ts
   */
  private skipDiffHeader() {

    // TODO: There's information in here that we might want to
    // capture, such as mode changes
    while (this.nextLine()) {
      if (this.lineStartsWith('+++')) {
        return
      }
    }

    throw new Error('Could not find end of diff header')
  }

  /**
   * Parses a hunk header or throws an error if the given line isn't
   * a well-formed hunk header.
   *
   * We currently only extract the line number information and
   * ignore any hunk headings.
   *
   * Example hunk header:
   *
   * @@ -84,10 +82,8 @@ export function parseRawDiff(lines: ReadonlyArray<string>): Diff {
   *
   * Where everything after the last @@ is what's known as the hunk, or section, heading
   */
  private parseHunkHeader(line: string): DiffSectionRange {
    const m = diffHeaderRe.exec(line)
    if (!m) { throw new Error(`Invalid hunk header format: '${line}'`) }

    const oldStartLine = numberFromGroup(m, 1)
    const oldEndLine = numberFromGroup(m, 2)
    const newStartLine = numberFromGroup(m, 3)
    const newEndLine = numberFromGroup(m, 4)

    return new DiffSectionRange(oldStartLine, oldEndLine, newStartLine, newEndLine)
  }

  /**
   * Parse a hunk, including its header or trows an error if the diff doesn't
   * contain a well-formed diff hunk at the current position.
   *
   * Expects that the position has been advanced to the beginning of a presumed
   * diff hunk header.
   *
   * @param linesConsumed The number of unified diff lines consumed up until
   *                      this point by the diff parser. Used to give the
   *                      position and length (in lines) of the parsed hunk
   *                      relative to the overall parsed diff. These numbers
   *                      have no real meaning in the context of a diff and
   *                      are only used to aid the app in line-selections.
   */
  private parseHunk(linesConsumed: number): DiffSection {

    const headerLine = this.readLine()

    if (!headerLine) {
      throw new Error('Expected hunk header but reached end of diff')
    }

    const header = this.parseHunkHeader(headerLine)
    const lines = new Array<string>()
    lines.push(headerLine)

    let c: string | null

    while ((c = this.peek()) && (c === prefixAdd || c === prefixDelete || c === prefixContext)) {
      const line = this.readLine()

      if (!line) {
        throw new Error('Expected unified diff line but reached end of diff')
      }

      lines.push(line)
    }

    if (lines.length === 1) {
      throw new Error('Malformed diff, empty hunk')
    }

    return new DiffSection(header, lines, linesConsumed, linesConsumed + lines.length - 1)
  }

  /**
   * Asserts that the remainder of the diff contains a newline warning and nothing
   * else. Throws an error if that's not the case.
   *
   * Newline warnings are produced when one version of a file lacks a trailing
   * newline. See:
   *
   * https://github.com/git/git/blob/8c6d1f9807c67532e7fb545a944b064faff0f70b/xdiff/xutils.c#L53
   * http://stackoverflow.com/a/5813359/2114
   */
  private consumeNewlineWarningAndAssertEndOfDiff() {
    const newLineWarning = this.readLine()
    if (!newLineWarning || newLineWarning !== '\\ No newline at end of file') {
      throw new Error('')
    }

    if (this.nextLine()) {
      throw new Error('Expected end of diff after newline warning')
    }
  }

  /**
   * Parse a well-formed unified diff into hunks and lines.
   *
   * @param text A unified diff produced by git diff, git log --patch
   *             or any other git plumbing command that produces unified
   *             diffs.
   */
  public parse(text: string): Diff {

    this.text = text

    try {
      // Scan past the diff header for now
      this.skipDiffHeader()

      const hunks = new Array<DiffSection>()
      let linesConsumed = 0
      let c: string | null = null

      do {
        const hunk = this.parseHunk(linesConsumed)
        hunks.push(hunk)
        linesConsumed += hunk.lines.length

      } while ((c = this.peek()) && c !== '\\')

      let noNewlineAtEndOfFile = false

      if (c === '\\') {
        this.consumeNewlineWarningAndAssertEndOfDiff()
        noNewlineAtEndOfFile = true
      }

      return new Diff(hunks, noNewlineAtEndOfFile)
    } finally {
      this.reset()
    }
  }
}

export function parseRawDiff(diffText: string): Diff {
    const parser = new DiffParser()
    return parser.parse(diffText)
}
