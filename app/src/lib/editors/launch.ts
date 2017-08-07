import { spawn } from 'child_process'

import { getAvailableEditors } from './lookup'

import { fatalError } from '../../lib/fatal-error'

/**
 * Get the executable path to launch for a given editor, or null if it cannot
 * be found.
 *
 * @param externalEditor Friendly name for the editor.
 */
async function getPathToEditor(externalEditor: string): Promise<string | null> {
  const programs = await getAvailableEditors()
  const match = programs.find(p => p.name === externalEditor)
  if (match) {
    return match.path
  }
  return null
}

/**
 * Open a given folder in the external editor.
 *
 * @param path The folder path to pass as an argument to launch in the editor.
 * @param externalEditor The friendly name of the editor. Currently supports
 * 'Atom', 'Visual Studio Code' or 'Sublime Text'.
 */
export async function launchExternalEditor(
  path: string,
  externalEditor: string
): Promise<void> {
  const editorPath = await getPathToEditor(externalEditor)

  if (editorPath === null) {
    console.warn(`Unable to find path for ${externalEditor}`)
    return
  }

  if (__WIN32__ || __DARWIN__) {
    // all tested editors support passing the folder name as the first argument
    spawn(editorPath, [path])
    return
  }

  return fatalError('Unsupported OS')
}
