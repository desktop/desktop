import { EditorConfiguration } from 'codemirror'

/**
 * Adds type declarations for properties that should be in `EditorConfiguration`
 * but aren't.
 */
export interface IEditorConfigurationExtra extends EditorConfiguration {
  /** The scrollbar style for the text area. */
  readonly scrollbarStyle: 'native' | 'simple'

  /**
   * This is used by the mark-selection addon and is unused if that
   * addon hasn't been loaded
   */
  readonly styleSelectedText?: boolean

  /**
   * A regular expression used to determine which characters should
   * be replaced by a special placeholder.
   */
  readonly specialChars?: RegExp

  /**
   * Explicitly set the line separator for the editor. By default (value null),
   * the document will be split on CRLFs as well as lone CRs and LFs, and a
   * single LF will be used as line separator in all output (such as getValue).
   * When a specific string is given, lines will only be split on that string,
   * and output will, by default, use that same separator.
   */
  readonly lineSeparator?: string
}
