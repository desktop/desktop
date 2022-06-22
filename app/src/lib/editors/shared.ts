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
  /** Arguments to use while launching the editor */
  launchArgs?: string
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

export const CustomEditorPickedLabel = 'External Editor'

export const CustomEditorRepoEntityPathValue = '%REPO_PATH%'

/**
 * Returns an array of valid launch arguments
 *
 * @param repoPath A folder or file path to pass as an argument when launching the editor.
 * @param launchArgs List of unverified launch arguments
 */
export async function processEditorLaunchArgs(
  repoPath: string,
  launchArgs: string | undefined
): Promise<string[]> {
  const defaultLaunchArgs = [repoPath]

  if (launchArgs !== undefined) {
    const normalizedArgs = normalizeLaunchArgs(repoPath, launchArgs)

    if (normalizedArgs !== undefined) {
      return normalizedArgs
    }
  }

  return defaultLaunchArgs
}

function normalizeLaunchArgs(repoPath: string, launchArgs: string) {
  const replaceRequiredArgs = launchArgs.replace(
    CustomEditorRepoEntityPathValue,
    repoPath
  )
  return replaceRequiredArgs.split(' ').filter(arg => arg !== '')
}

export const suggestedExternalEditor = {
  name: 'Visual Studio Code',
  url: 'https://code.visualstudio.com',
}
