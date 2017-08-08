import { FoundEditor, ExternalEditorError } from './shared'
import { getAvailableEditors as getAvailableEditorsDarwin } from './darwin'
import { getAvailableEditors as getAvailableEditorsWindows } from './win32'
import { fatalError } from '../fatal-error'

let editorCache: ReadonlyArray<FoundEditor> | null = null

/**
 * Resolve a list of installed editors on the user's machine, using the known
 * install identifiers that each OS supports.
 */
export async function getAvailableEditors(): Promise<
  ReadonlyArray<FoundEditor>
> {
  if (editorCache && editorCache.length > 0) {
    return editorCache
  }

  if (__DARWIN__) {
    editorCache = await getAvailableEditorsDarwin()
    return editorCache
  }

  if (__WIN32__) {
    editorCache = await getAvailableEditorsWindows()
    return editorCache
  }

  return fatalError(
    `Platform not currently supported for resolving editors: ${process.platform}`
  )
}

export async function findEditorOrDefault(
  name: string | null
): Promise<FoundEditor> {
  const editors = await getAvailableEditors()
  if (editors.length === 0) {
    throw new ExternalEditorError(
      'No suitable editors installed for GitHub Desktop to launch. Install Atom for your platform and try again.',
      { suggestAtom: true }
    )
  }

  if (name === null) {
    return editors[0]
  }

  const match = editors.find(p => p.name === name) || null
  if (!match) {
    const menuItemName = __DARWIN__ ? 'Preferences' : 'Options'
    const message = `The editor '${name}' could not be found. Please open ${menuItemName} and choose an available editor.`

    throw new ExternalEditorError(message, { openPreferences: true })
  }

  return match
}
