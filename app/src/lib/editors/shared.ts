import { ExternalEditor } from '../../models/editors'

interface IProgramNotFound {
  readonly editor: ExternalEditor
  readonly installed: false
}

interface IProgramMissing {
  readonly editor: ExternalEditor
  readonly installed: true
  readonly pathExists: false
}

interface IProgramFound {
  readonly editor: ExternalEditor
  readonly installed: true
  readonly pathExists: true
  readonly path: string
}

export type LookupResult = IProgramNotFound | IProgramMissing | IProgramFound

/**
 * A found external editor on the user's machine
 */
export type FoundEditor = {
  /**
   * The friendly name of the editor, to be used in labels
   */
  editor: ExternalEditor
  /**
   * The executable associated with the editor to launch
   */
  path: string
}

interface IErrorMetadata {
  /** The error dialog should link off to the Atom website */
  suggestAtom?: boolean

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
