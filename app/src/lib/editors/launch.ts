import { spawn } from 'child_process'
import { pathExists } from 'fs-extra'
import { join } from 'path'
import { ExternalEditorError, FoundEditor } from './shared'

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
  if (editor.editor === 'Visual Studio Code') {
    launchVisualStudioCode(editor, fullPath)
  } else {
    const usesShell = editor.usesShell ? editor.usesShell : false
    spwanExternalEditor(editorPath, fullPath, usesShell)
  }
}

function launchVisualStudioCode(
  editor: FoundEditor,
  repoRootFolderPath: string
) {
  const workspacePattern = join(repoRootFolderPath, '*.code-workspace')
  const glob = require("glob")
  glob(workspacePattern, (error: Error, files: string[]) => {
    if (error) {
      throw error
    }
    else {
      const workspaceFilePath = chooseWorkspaceFileToOpen(files, repoRootFolderPath)
      const openTarget = workspaceFilePath === '' ? repoRootFolderPath : workspaceFilePath
      const usesShell = editor.usesShell ? editor.usesShell : false

      spwanExternalEditor(editor.path, openTarget, usesShell)
    }
  })
}

function chooseWorkspaceFileToOpen(
  files: string[],
  repoRootFolderPath: string
): string {
  let workspaceFilePath: string | undefined
  if (files.length === 0) {
    workspaceFilePath = ''
  } else if (files.length === 1) {
    workspaceFilePath = files.pop()
  } else {
    const dialog = require('electron').remote.dialog;
    const fileName = dialog.showOpenDialog({
      properties: ['openFile'],
      title: 'Open Workspace',
      defaultPath: repoRootFolderPath,
      filters: [
        { name: 'Code Workspace', extensions: ['code-workspace'] }
      ]
    });

    workspaceFilePath = fileName.pop()
  }

  return workspaceFilePath === undefined ? '' : workspaceFilePath
}

function spwanExternalEditor(
  editorPath: string,
  repoRootFolderPath: string,
  usesShell: boolean
) {
  if (usesShell) {
    spawn(`"${editorPath}"`, [`"${repoRootFolderPath}"`], { shell: true })
  } else {
    spawn(editorPath, [repoRootFolderPath])
  }
}
