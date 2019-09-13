import { spawn } from 'child_process'
import { pathExists } from 'fs-extra'
import { ExternalEditorError, FoundEditor } from './shared'
import { ExternalEditor as Darwin } from './darwin'
import { findFilesMatching } from '../file-system'

/**
 * Open a given file or folder in the desired external editor.
 *
 * @param fullPath A folder or file path to pass as an argument when launching the editor.
 * @param editor The external editor to launch.
 */
export async function launchExternalEditor(
  fullPath: string,
  editor: FoundEditor
): Promise<void> {
  const editorPath = editor.path

  //Special launching for Xcode.
  if (editor.editor === Darwin.Xcode) {
    const projectFiles = await findFilesMatching('*.xcodeproj', fullPath)
    const workspaces = await findFilesMatching('*.xcworkspace', fullPath)
    if (projectFiles.length === 0 && workspaces.length === 0) {
      // const label = __DARWIN__ ? 'Preferences' : 'Options'
      throw new Error(
        `Could not find Xcode project or workspace files in the repository folder.`
      )
    } else {
      //If both project file and workspace exist, open the workspace file.
      if (workspaces.length !== 0) {
        spawn(editorPath, [fullPath + '/' + workspaces[0]])
      } else {
        //Right now, if there're multiple project files, this code
        //will open the first one in array
        spawn(editorPath, [fullPath + '/' + projectFiles[0]])
      }
    }
    return
  }

  //For all other editors

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
  if (editor.usesShell) {
    spawn(`"${editorPath}"`, [`"${fullPath}"`], { shell: true })
  } else {
    spawn(editorPath, [fullPath])
  }
}
