import * as Darwin from './darwin'
import * as Win32 from './win32'
import * as Linux from './linux'

export type ExternalEditor = Darwin.ExternalEditor | Win32.ExternalEditor

/** Parse the label into the specified shell type. */
export function parse(label: string): ExternalEditor | null {
  if (__DARWIN__) {
    return Darwin.parse(label)
  } else if (__WIN32__) {
    return Win32.parse(label)
  } else if (__LINUX__) {
    return Linux.parse(label)
  }

  throw new Error(
    `Platform not currently supported for resolving editors: ${
    process.platform
    }`
  )
}

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
  /**
   * the editor requires a shell spawn to launch
   */
  usesShell?: boolean
  /**
   * Whether we use workspase file when we launch Visual Studio Code
   */
  useWorkspace?: boolean
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
