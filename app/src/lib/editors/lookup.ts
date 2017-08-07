import { FoundEditor } from './models'
import { getAvailableEditors as getAvailableEditorsDarwin } from './darwin'
import { getAvailableEditors as getAvailableEditorsWindows } from './win32'

let editorCache: ReadonlyArray<FoundEditor> = []

export async function getAvailableEditors(): Promise<
  ReadonlyArray<FoundEditor>
> {
  if (editorCache.length > 0) {
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

  console.warn(
    `Platform not currently supported for resolving editors: ${process.platform}`
  )
  return editorCache
}
