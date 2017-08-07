import { findApp } from './darwin'
import {
  findSublimeTextExecutable,
  findAtomExecutable,
  findCodeExecutable,
} from './win32'

export type EditorLookup = {
  app: string
  path: string
}

let editorCache: ReadonlyArray<EditorLookup> = []

async function getAvailableEditorsDarwin(): Promise<
  ReadonlyArray<EditorLookup>
> {
  const atom = await findApp('com.github.atom', 'Atom')
  const code = await findApp('com.microsoft.VSCode', 'Visual Studio Code')

  // TODO: what about Sublime Text 2?
  const sublime = await findApp('com.sublimetext.3', 'Sublime Text')

  const results = [atom, code, sublime]
  return results.filter(result => result.path !== '')
}

async function getAvailableEditorsWindows(): Promise<
  ReadonlyArray<EditorLookup>
> {
  const atom = await findAtomExecutable()
    .catch(error => {
      log.debug('Unable to locate Atom installation', error)
      return ''
    })
    .then(path => {
      return { app: 'Atom', path }
    })

  const code = await findCodeExecutable()
    .catch(error => {
      log.debug('Unable to locate VSCode installation', error)
      return ''
    })
    .then(path => {
      return { app: 'Visual Studio Code', path }
    })

  const sublime = await findSublimeTextExecutable()
    .catch(error => {
      log.debug('Unable to locate Sublime text installation', error)
      return ''
    })
    .then(path => {
      return { app: 'Sublime Text', path }
    })

  const results = [atom, code, sublime]
  return results.filter(result => result.path !== '')
}

export async function getAvailableEditors(): Promise<
  ReadonlyArray<EditorLookup>
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
