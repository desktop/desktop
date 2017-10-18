/**
 * Represents a single token inside of a line.
 * This object is useless without the startIndex
 * information contained within the ILineTokens interface.
 */
export interface IToken {
  length: number
  token: string
}

/**
 * A lookup object keyed on the line index (relative to the
 * start of the line) containing the tokens parsed from
 * that line.
 */
export interface ILineTokens {
  [startIndex: number]: IToken
}

/**
 * A lookup object keyed on lines containing another
 * lookup from startIndex (relative to line start position)
 * and token.
 *
 * This structure is returned by the highlighter worker and
 * is used by the Diff Syntax Mode to provide syntax
 * highligting in diffs. See the diff syntax mode for more
 * details on how this object is to be interpreted.
 */
export interface ITokens {
  [line: number]: ILineTokens
}
