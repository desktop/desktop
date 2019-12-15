/**
 * Represents a single token inside of a line.
 * This object is useless without the startIndex
 * information contained within the ILineTokens interface.
 */
export interface IToken {
  readonly length: number
  readonly token: string
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
 * highlighting in diffs. See the diff syntax mode for more
 * details on how this object is to be interpreted.
 */
export interface ITokens {
  [line: number]: ILineTokens
}

/**
 * Represents a request to detect the language and highlight
 * the contents provided.
 */
export interface IHighlightRequest {
  /**
   * The width of a tab character. Defaults to 4. Used by the
   * stream to count columns. See CodeMirror's StringStream
   * class for more details.
   */
  readonly tabSize: number

  /**
   * The file basename of the path in question as returned
   * by node's basename() function.
   */
  readonly basename: string

  /**
   * The file extension of the path in question as returned
   * by node's extname() function (i.e. with a leading dot).
   */
  readonly extension: string

  /**
   * The actual contents which is to be used for highlighting.
   */
  readonly contents: string

  /**
   * An optional filter of lines which needs to be tokenized.
   *
   * If undefined or empty array all lines will be tokenized
   * and returned. By passing an explicit set of lines we can
   * both minimize the size of the response object (which needs
   * to be serialized over the IPC boundary) and, for stateless
   * modes we can significantly speed up the highlight process.
   */
  readonly lines?: Array<number>

  /**
   * When enabled (off by default), an extra CSS class will be
   * added to each token, indicating the (inner) mode that
   * produced it, prefixed with "cm-m-". For example, tokens from
   * the XML mode will get the cm-m-xml class.
   */
  readonly addModeClass?: boolean
}
