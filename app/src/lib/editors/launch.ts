import { spawn, SpawnOptions } from 'child_process'
import { pathExists } from '../../ui/lib/path-exists'
import { ExternalEditorError, FoundEditor } from './shared'
import {
  expandTargetPathArgument,
  ICustomIntegration,
  parseCustomIntegrationArguments,
  spawnCustomIntegration,
} from '../custom-integration'

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
  const label = __DARWIN__ ? 'Settings' : 'Options'
  if (!exists) {
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

  try {
    if (editor.usesShell) {
      spawn(`"${editorPath}"`, [`"${fullPath}"`], { ...opts, shell: true })
    } else if (__DARWIN__) {
      // In macOS we can use `open`, which will open the right executable file
      // for us, we only need the path to the editor .app folder.
      spawn('open', ['-a', editorPath, fullPath], opts)
    } else {
      spawn(editorPath, [fullPath], opts)
    }
  } catch (error) {
    log.error(`Error while launching ${editor.editor}`, error)
    if (error?.code === 'EACCES') {
      throw new ExternalEditorError(
        `GitHub Desktop doesn't have the proper permissions to start '${editor.editor}'. Please open ${label} and try another editor.`,
        { openPreferences: true }
      )
    } else {
      throw new ExternalEditorError(
        `Something went wrong while trying to start '${editor.editor}'. Please open ${label} and try another editor.`,
        { openPreferences: true }
      )
    }
  }
}

/**
 * Open a given file or folder in the desired custom external editor.
 *
 * @param fullPath A folder or file path to pass as an argument when launching the editor.
 * @param customEditor The external editor to launch.
 */
export async function launchCustomExternalEditor(
  fullPath: string,
  customEditor: ICustomIntegration
): Promise<void> {
  const editorPath = customEditor.path
  const exists = await pathExists(editorPath)
  const label = __DARWIN__ ? 'Settings' : 'Options'
  if (!exists) {
    throw new ExternalEditorError(
      `Could not find executable for custom editor at path '${customEditor.path}'.  Please open ${label} and select an available editor.`,
      { openPreferences: true }
    )
  }

  const opts: SpawnOptions = {
    // Make sure the editor processes are detached from the Desktop app.
    // Otherwise, some editors (like Notepad++) will be killed when the
    // Desktop app is closed.
    detached: true,
  }

  const argv = parseCustomIntegrationArguments(customEditor.arguments)

  // Replace instances of RepoPathArgument with fullPath in customEditor.arguments
  const args = expandTargetPathArgument(argv, fullPath)

  try {
    // This logic around `usesShell` is also used in Windows `getAvailableEditors` implementation
    const usesShell = editorPath.endsWith('.cmd')
    if (usesShell) {
      spawnCustomIntegration(editorPath, args, {
        ...opts,
        shell: true,
      })
    } else if (__DARWIN__ && customEditor.bundleID) {
      // In macOS we can use `open` if it's an app (i.e. if we have a bundleID),
      // which will open the right executable file for us, we only need the path
      // to the editor .app folder.
      spawnCustomIntegration('open', ['-a', editorPath, ...args], opts)
    } else {
      spawnCustomIntegration(editorPath, args, opts)
    }
  } catch (error) {
    log.error(
      `Error while launching custom editor at path ${customEditor.path} with arguments ${args}`,
      error
    )
    if (error?.code === 'EACCES') {
      throw new ExternalEditorError(
        `GitHub Desktop doesn't have the proper permissions to start custom editor at path ${customEditor.path}. Please open ${label} and try another editor.`,
        { openPreferences: true }
      )
    } else {
      throw new ExternalEditorError(
        `Something went wrong while trying to start custom editor at path ${customEditor.path}. Please open ${label} and try another editor.`,
        { openPreferences: true }
      )
    }
  }
}
