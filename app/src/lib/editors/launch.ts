import { spawn } from 'child_process'

import { getAvailableEditors } from './lookup'
import { pathExists, ExternalEditorError } from './shared'

/**
 * Open a given folder in the external editor.
 *
 * @param path The folder path to pass as an argument to launch in the editor.
 * @param externalEditor The friendly name of the editor. Currently supports
 * 'Atom', 'Visual Studio Code' or 'Sublime Text'.
 */
export async function launchExternalEditor(
  path: string,
  externalEditor: string,
  onError: (error: Error) => void
): Promise<void> {
  const editors = await getAvailableEditors()
  if (editors.length === 0) {
    onError(
      new ExternalEditorError(
        'No suitable editors installed for GitHub Desktop to launch',
        { suggestAtom: true }
      )
    )
    return
  }

  const match = editors.find(p => p.name === externalEditor)
  if (!match) {
    const menuItemName = __DARWIN__ ? 'Preferences' : 'Options'
    const message = `The editor '${externalEditor}' could not be found. Please open ${menuItemName} and choose an available editor.`

    onError(new ExternalEditorError(message, { openPreferences: true }))
    return
  }

  const editorPath = match.path
  const exists = await pathExists(editorPath)
  if (exists) {
    if (__WIN32__ || __DARWIN__) {
      spawn(editorPath, [path])
    } else {
      onError(
        new ExternalEditorError(
          `'Open in External Editor' has not been implemented for platform: '${process.platform}'`,
          {}
        )
      )
    }
  } else {
    onError(
      new ExternalEditorError(
        `Could not find executable for '${externalEditor}' at path '${match.path}'.  Please open Preferences and choose an available editor.`,
        { openPreferences: true }
      )
    )
  }
}
