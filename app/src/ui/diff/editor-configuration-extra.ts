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
  readonly styleSelectedText?: boolean,
}
