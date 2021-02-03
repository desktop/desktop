/**
 * A found external editor on the user's machine
 */
export type FoundEditor = {
  /**
   * The friendly name of the editor, to be used in labels
   */
  editor: string
  /**
   * The executable associated with the editor to launch
   */
  path: string
  /**
   * the editor requires a shell spawn to launch
   */
  usesShell?: boolean
}

interface IErrorMetadata {
  /** The error dialog should link off to the default editor's website */
  suggestDefaultEditor?: boolean

  /** The error dialog should direct the user to open Preferences */
  openPreferences?: boolean
}

export class ExternalEditorError extends Error {
  /** The error's metadata. */
  public readonly metadata: IErrorMetadata

  public constructor(message: string, metadata: IErrorMetadata = {}) {
    super(message)

    this.metadata = metadata
  }
}

export const suggestedExternalEditor = {
  name: 'Visual Studio Code',
  url: 'https://code.visualstudio.com',
}
