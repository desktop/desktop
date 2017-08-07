/**
 * A found external editor on the user's machine
 */
export type FoundEditor = {
  /**
   * The friendly name of the editor, to be used in labels
   */
  name: string
  /**
   * The executable associated with the editor to launch
   */
  path: string
}

// labels for the editors, to reduce duplication in the codebase
export const AtomLabel = 'Atom'
export const VisualStudioCodeLabel = 'Visual Studio Code'
export const SublimeTextLabel = 'Sublime Text'
