import * as Path from 'path'
import { ExternalEditor } from '../../models/editors'

/**
 * appPath will raise an error if it cannot find the program.
 */
const appPath: (bundleId: string) => Promise<string> = require('app-path')

import { LookupResult, FoundEditor, pathExists } from './shared'

async function findAtomApplication(): Promise<LookupResult> {
  const editor = ExternalEditor.Atom

  try {
    const installPath = await appPath('com.github.atom')
    const path = Path.join(
      installPath,
      'Contents',
      'Resources',
      'app',
      'atom.sh'
    )
    const exists = await pathExists(path)
    if (!exists) {
      log.debug(`Command line interface for ${editor} not found at '${path}'`)
      return {
        editor,
        installed: true,
        pathExists: false,
      }
    }
    return {
      editor,
      installed: true,
      pathExists: true,
      path,
    }
  } catch (error) {
    log.debug(`Unable to locate ${editor} installation`, error)
    return { editor, installed: false }
  }
}

async function findCodeApplication(): Promise<LookupResult> {
  const editor = ExternalEditor.VisualStudioCode
  try {
    const installPath = await appPath('com.microsoft.VSCode')
    const path = Path.join(
      installPath,
      'Contents',
      'Resources',
      'app',
      'bin',
      'code'
    )
    const exists = await pathExists(path)
    if (!exists) {
      log.debug(`Command line interface for ${editor} not found at '${path}'`)
      return {
        editor,
        installed: true,
        pathExists: false,
      }
    }
    return {
      editor,
      installed: true,
      pathExists: true,
      path,
    }
  } catch (error) {
    log.debug(`Unable to locate ${editor} installation`, error)
    return { editor, installed: false }
  }
}

async function findSublimeTextApplication(): Promise<LookupResult> {
  const editor = ExternalEditor.SublimeText
  try {
    const sublimeApp = await appPath('com.sublimetext.3')
    const path = Path.join(
      sublimeApp,
      'Contents',
      'SharedSupport',
      'bin',
      'subl'
    )

    const exists = await pathExists(path)
    if (!exists) {
      log.debug(`Command line interface for ${editor} not found at '${path}'`)
      return {
        editor,
        installed: true,
        pathExists: false,
      }
    }
    return {
      editor,
      installed: true,
      pathExists: true,
      path,
    }
  } catch (error) {
    log.debug(`Unable to locate ${editor} installation`, error)
    return { editor, installed: false }
  }
}

/**
 * Lookup the known external editors using the bundle ID that each uses
 * to register itself on a user's machine.
 */
export async function getAvailableEditors(): Promise<
  ReadonlyArray<FoundEditor>
> {
  const results: Array<FoundEditor> = []

  const [atom, code, sublime] = await Promise.all([
    findAtomApplication(),
    findCodeApplication(),
    findSublimeTextApplication(),
  ])

  if (atom.installed && atom.pathExists) {
    results.push({ editor: atom.editor, path: atom.path })
  }

  if (code.installed && code.pathExists) {
    results.push({ editor: code.editor, path: code.path })
  }

  if (sublime.installed && sublime.pathExists) {
    results.push({ editor: sublime.editor, path: sublime.path })
  }

  return results
}

/**
 * Find the first editor that exists on the user's machine, or return null if
 * no matches are found.
 */
export async function getFirstEditorOrDefault(): Promise<FoundEditor | null> {
  const atom = await findAtomApplication()
  if (atom.installed && atom.pathExists) {
    return { editor: atom.editor, path: atom.path }
  }

  const code = await findCodeApplication()
  if (code.installed && code.pathExists) {
    return { editor: code.editor, path: code.path }
  }

  const sublime = await findSublimeTextApplication()
  if (sublime.installed && sublime.pathExists) {
    return { editor: sublime.editor, path: sublime.path }
  }

  return null
}
