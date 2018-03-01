import { spawn } from 'child_process'
import { pathExists } from '../file-system'
import { ExternalEditorError, FoundEditor } from './shared'

/**
 * Open a given folder in the desired external editor.
 *
 * @param path The folder to pass as an argument when launching the editor.
 * @param editor The external editor to launch.
 */
export async function launchExternalEditor(
  path: string,
  editor: FoundEditor
): Promise<void> {
  const editorPath = editor.path
  const exists = await pathExists(editorPath)
  if (!exists) {
    const label = __DARWIN__ ? 'Preferences' : 'Options'
    throw new ExternalEditorError(
      `Could not find executable for '${editor.editor}' at path '${
        editor.path
      }'.  Please open ${label} and select an available editor.`,
      { openPreferences: true }
    )
  }

  spawn(editorPath, [path])
}
