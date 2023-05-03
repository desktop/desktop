import { spawn, SpawnOptions } from 'child_process'
import { pathExists } from '../../ui/lib/path-exists'
import { ExternalEditorError, FoundEditor } from './shared'
import { executableExists } from '../../ui/lib/executable-exists'

/**
 * Open a given file or folder in the desired external editor.
 *
 * @param fullPath A folder or file path to pass as an argument when launching the editor.
 * @param editor The external editor to launch.
 * @param line The line number to open the file at.
 */
export async function launchExternalEditor(
  fullPath: string,
  editor: FoundEditor,
  line?: number
): Promise<void> {
  const editorPath = editor.path
  const exists = await pathExists(editorPath)
  if (!exists) {
    const label = __DARWIN__ ? 'Preferences' : 'Options'
    throw new ExternalEditorError(
      `Could not find executable for '${editor.editor}' at path '${editor.path}'.  Please open ${label} and select an available editor.`,
      { openPreferences: true }
    )
  }

  const opts: SpawnOptions = {
    // Make sure the editor processes are detached from the Desktop app.
    // Otherwise, some editors (like Notepad++) will be killed when the
    // Desktop app is closed.
    detached: true,
  }

  if (editor.usesShell) {
    spawn(`"${editorPath}"`, [`"${fullPath}"`], { ...opts, shell: true })
  } else if (__DARWIN__) {
    if (line && editorOpenToLineCommands[editor.editor]) {
      try {
        await editorOpenToLineCommands[editor.editor](editor, fullPath, line)
        return
      } catch (error) {
        throw new ExternalEditorError(error.message, {
          suggestDefaultEditor: true,
        })
      }
    }
    // In macOS we can use `open`, which will open the right executable file
    // for us, we only need the path to the editor .app folder.
    spawn('open', ['-a', editorPath, fullPath], opts)
  } else {
    spawn(editorPath, [fullPath], opts)
  }
}

/**
 * Unfortunately, the ‘open’ command does not have an option to open a file in a
 * specific line number. The map below defines functions for opening files to a
 * specific line for supported editors.
 *
 * This typically involves 1) Checking for a specific binary on path 2) Running
 * a command
 */
const editorOpenToLineCommands: { [key: string]: any } = {
  'Visual Studio Code': async (
    editor: FoundEditor,
    fullPath: string,
    line: string
  ) => {
    const execName = 'code'
    if (!(await executableExists(execName))) {
      throw new Error(
        `Could not find the '${execName}' executable for '${editor.editor}' on path. Please install and try again.`
      )
    }

    spawn(execName, ['-g', `${fullPath}:${line}`])
  },
}
