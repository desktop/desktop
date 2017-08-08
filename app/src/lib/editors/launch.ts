import { spawn } from 'child_process'

import { pathExists, ExternalEditorError, FoundEditor } from './shared'

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
    throw new ExternalEditorError(
      `Could not find executable for '${editor.name}' at path '${editor.path}'.  Please open Preferences and choose an available editor.`,
      { openPreferences: true }
    )
  }

  if (__WIN32__ || __DARWIN__) {
    spawn(editorPath, [path])
    return
  }

  throw new ExternalEditorError(
    `'Open in External Editor' has not been implemented for platform: '${process.platform}'`
  )
}
