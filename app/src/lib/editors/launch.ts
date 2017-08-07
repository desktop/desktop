import { spawn } from 'child_process'

import { getAvailableEditors } from './lookup'
import { pathExists } from './shared'

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
    onError(new Error('No editors installed, install Atom?'))
    return
  }

  const match = editors.find(p => p.name === externalEditor)
  if (!match) {
    onError(new Error(`Could not find editor '${externalEditor}', what to do?`))
    return
  }

  const editorPath = match.path
  const exists = await pathExists(editorPath)
  if (exists) {
    if (__WIN32__ || __DARWIN__) {
      spawn(editorPath, [path])
    } else {
      onError(
        new Error(
          `Open in External Editor has not been implemented for platform: '${process.platform}'`
        )
      )
    }
  } else {
    onError(
      new Error(
        `Could not find executable for '${externalEditor}' at path '${match.path}'`
      )
    )
  }
}
