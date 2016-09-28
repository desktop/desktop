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

export class DiffParser {
  private ls: number
  private le: number

  private text: string
  private lineBuffer = new Array<string>()

  public constructor() {
    this.reset()
  }

  private nextLine(): boolean {
    this.ls = this.le + 1

    if (this.ls >= this.text.length) {
      return false
    }

    this.le = this.text.indexOf('\n', this.ls)

    if (this.le === -1) {
      this.le = this.text.length // -1?
    }

    return this.ls !== this.le
  }

  private readLine(): string | null {
    return this.nextLine()
      ? this.text.substring(this.ls, this.le)
      : null
  }

  private lineStartsWith(searchString: string): boolean {
    return this.text.startsWith(searchString, this.ls)
  }

  private peek(): string | null {
    const p = this.le + 1
    return p < this.text.length ? this.text[p] : null
  }

  private reset() {
    this.ls = 0
    this.le = 0
    this.text = ''
    this.lineBuffer = new Array<string>()
  }

  private parseDiffPreText() {

    // Scan past the diff header for now.
    // TODO: There's information in here that we might want to
    // capture, such as mode changes
    while (this.nextLine()) {
      if (this.lineStartsWith('+++')) {
        return
      }
    }

    throw new Error('Could not find end of diff header')
  }

  private parseHunkHeader(line: string): DiffSectionRange {
    const m = diffHeaderRe.exec(line)
    if (!m) { throw new Error(`Invalid hunk header format: '${line}'`) }

    const oldStartLine = numberFromGroup(m, 1)
    const oldEndLine = numberFromGroup(m, 2)
    const newStartLine = numberFromGroup(m, 3)
    const newEndLine = numberFromGroup(m, 4)

    return new DiffSectionRange(oldStartLine, oldEndLine, newStartLine, newEndLine)
  }

  private parseHunk(linesConsumed: number): DiffSection {

    const headerLine = this.readLine()

    if (!headerLine) {
      throw new Error('Expected hunk header but reached end of diff')
    }

    const header = this.parseHunkHeader(headerLine)
    const lines = new Array<string>()
    lines.push(headerLine)

    let c: string | null

    while ((c = this.peek()) && (c === '+' || c === '-' || c === ' ')) {
      const line = this.readLine()

      if (!line) {
        throw new Error('Expected unified diff line but reached end of diff')
      }

      lines.push(line)
    }

    // Just the header
    if (lines.length === 1) {
      throw new Error('Malformed diff, empty hunk')
    }

    return new DiffSection(header, lines, linesConsumed, linesConsumed + lines.length - 1)
  }

  private consumeNewlineWarningAndAssertEndOfDiff() {
    const newLineWarning = this.readLine()
    if (!newLineWarning || newLineWarning !== '\\ No newline at end of file') {
      throw new Error('')
    }

    if (this.nextLine()) {
      throw new Error('Expected end of diff after newline warning')
    }
  }

  public parse(text: string): Diff {

    this.text = text

    try {
      this.parseDiffPreText()

      const hunks = new Array<DiffSection>()
      let linesConsumed = 0
      let noNewlineAtEndOfFile = false
      let c: string | null = null

      do {
        const hunk = this.parseHunk(linesConsumed)
        hunks.push(hunk)
        linesConsumed += hunk.lines.length

      } while ((c = this.peek()) && c !== '\\')

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
