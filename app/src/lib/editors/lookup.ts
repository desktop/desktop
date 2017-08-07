import { FoundEditor } from './shared'
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
