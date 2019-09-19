import { spawn } from 'child_process'
import { pathExists } from 'fs-extra'
import { ExternalEditorError, FoundEditor } from './shared'
import { ExternalEditor as Darwin } from './darwin'
import { readdir, lstat } from 'fs-extra'

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
    const pathStat = await lstat(fullPath)
    //Directly open if the fullPath contains a file
    if (pathStat.isFile()) {
      spawn(editorPath, [fullPath])
      return
    }
    //Otherwise, check the folder content for xCode related files
    const files = await readdir(fullPath)
    const projectFiles = files.filter(f => f.endsWith('.xcodeproj'))
    const workspaces = files.filter(f => f.endsWith('.xcworkspace'))
    if (projectFiles.length === 0 && workspaces.length === 0) {
      throw new Error(
        `Could not find Xcode project or workspace files in the repository folder.`
      )
    } else {
      //If both project and workspace files exist, open the workspace.
      if (workspaces.length !== 0) {
        spawn(editorPath, [fullPath + '/' + workspaces[0]])
      } else {
        //If there're multiple project files, the first one in the Array
        //will open
        spawn(editorPath, [fullPath + '/' + projectFiles[0]])
      }
    }
    return
  }

  //For other editors

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
