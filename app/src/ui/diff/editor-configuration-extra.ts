import { EditorConfiguration } from 'codemirror'

/**
 * Adds type declarations for properties that should be in `EditorConfiguration`
 * but aren't.
 */
export interface IEditorConfigurationExtra extends EditorConfiguration {
  /** The scrollbar style for the text area. */
  readonly scrollbarStyle: 'native' | 'simple'
}
