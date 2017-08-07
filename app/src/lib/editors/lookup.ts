import { spawn } from 'child_process'

import { fatalError } from '../../lib/fatal-error'
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

export function getAvailableEditors(): Promise<ReadonlyArray<EditorLookup>> {
  if (__DARWIN__) {
    return getAvailableEditorsDarwin()
  }

  if (__WIN32__) {
    return getAvailableEditorsWindows()
  }

  console.warn(
    `Platform not currently supported for resolving editors: ${process.platform}`
  )
  return Promise.resolve([])
}

async function getPathToEditor(app: string): Promise<string> {
  const programs = await getAvailableEditors()
  const match = programs.find(p => p.app === app)
  if (match) {
    return match.path
  } else {
    return ''
  }
}

export async function openInExternalEditor(
  path: string,
  app: string
): Promise<void> {
  const editorPath = await getPathToEditor(app)

  if (__WIN32__) {
    spawn(editorPath, [path])
    return
  }

  return fatalError('Unsupported OS')
}
