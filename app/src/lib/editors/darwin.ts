import * as Path from 'path'
import { ExternalEditor } from '../../models/editors'
import { pathExists } from '../file-system'
import { LookupResult, FoundEditor } from './shared'
import { assertNever } from '../fatal-error'

/**
 * appPath will raise an error if it cannot find the program.
 */
const appPath: (bundleId: string) => Promise<string> = require('app-path')

function getBundleIdentifier(editor: ExternalEditor): string {
  switch (editor) {
    case ExternalEditor.Atom:
      return 'com.github.atom'
    case ExternalEditor.VisualStudioCode:
      return 'com.microsoft.VSCode'
    case ExternalEditor.SublimeText:
      return 'com.sublimetext.3'
    default:
      return assertNever(editor, `Unknown external editor: ${editor}`)
  }
}

function getExecutableShim(
  editor: ExternalEditor,
  installPath: string
): string {
  switch (editor) {
    case ExternalEditor.Atom:
      return Path.join(installPath, 'Contents', 'Resources', 'app', 'atom.sh')
    case ExternalEditor.VisualStudioCode:
      return Path.join(
        installPath,
        'Contents',
        'Resources',
        'app',
        'bin',
        'code'
      )
    case ExternalEditor.SublimeText:
      return Path.join(installPath, 'Contents', 'SharedSupport', 'bin', 'subl')
    default:
      return assertNever(editor, `Unknown external editor: ${editor}`)
  }
}

async function findApplication(editor: ExternalEditor): Promise<LookupResult> {
  try {
    const identifier = getBundleIdentifier(editor)
    const installPath = await appPath(identifier)
    const path = getExecutableShim(editor, installPath)
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
 * Lookup known external editors using the bundle ID that each uses
 * to register itself on a user's machine when installing.
 */
export async function getAvailableEditors(): Promise<
  ReadonlyArray<FoundEditor>
> {
  const results: Array<FoundEditor> = []

  const [atom, code, sublime] = await Promise.all([
    findApplication(ExternalEditor.Atom),
    findApplication(ExternalEditor.VisualStudioCode),
    findApplication(ExternalEditor.SublimeText),
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
  const atom = await findApplication(ExternalEditor.Atom)
  if (atom.installed && atom.pathExists) {
    return { editor: atom.editor, path: atom.path }
  }

  const code = await findApplication(ExternalEditor.VisualStudioCode)
  if (code.installed && code.pathExists) {
    return { editor: code.editor, path: code.path }
  }

  const sublime = await findApplication(ExternalEditor.SublimeText)
  if (sublime.installed && sublime.pathExists) {
    return { editor: sublime.editor, path: sublime.path }
  }

  return null
}
