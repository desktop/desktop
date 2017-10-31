import * as Path from 'path'
import { pathExists } from '../file-system'
import { IFoundEditor } from './found-editor'
import { assertNever } from '../fatal-error'

export enum ExternalEditor {
  Atom = 'Atom',
  VisualStudioCode = 'Visual Studio Code',
  SublimeText = 'Sublime Text',
}

export function parse(label: string): ExternalEditor | null {
  if (label === ExternalEditor.Atom) {
    return ExternalEditor.Atom
  }

  if (label === ExternalEditor.VisualStudioCode) {
    return ExternalEditor.VisualStudioCode
  }
  if (label === ExternalEditor.SublimeText) {
    return ExternalEditor.SublimeText
  }

  return null
}

/**
 * appPath will raise an error if it cannot find the program.
 */
const appPath: (bundleId: string) => Promise<string> = require('app-path')

function getBundleIdentifiers(editor: ExternalEditor): ReadonlyArray<string> {
  switch (editor) {
    case ExternalEditor.Atom:
      return ['com.github.atom']
    case ExternalEditor.VisualStudioCode:
      return ['com.microsoft.VSCode', 'com.microsoft.VSCodeInsiders']
    case ExternalEditor.SublimeText:
      return ['com.sublimetext.3']
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

async function findApplication(editor: ExternalEditor): Promise<string | null> {
  const identifiers = getBundleIdentifiers(editor)
  for (const identifier of identifiers) {
    try {
      const installPath = await appPath(identifier)
      const path = getExecutableShim(editor, installPath)
      const exists = await pathExists(path)
      if (exists) {
        return path
      }

      log.debug(`Command line interface for ${editor} not found at '${path}'`)
    } catch (error) {
      log.debug(`Unable to locate ${editor} installation`, error)
    }
  }

  return null
}

/**
 * Lookup known external editors using the bundle ID that each uses
 * to register itself on a user's machine when installing.
 */
export async function getAvailableEditors(): Promise<
  ReadonlyArray<IFoundEditor<ExternalEditor>>
> {
  const results: Array<IFoundEditor<ExternalEditor>> = []

  const [atomPath, codePath, sublimePath] = await Promise.all([
    findApplication(ExternalEditor.Atom),
    findApplication(ExternalEditor.VisualStudioCode),
    findApplication(ExternalEditor.SublimeText),
  ])

  if (atomPath) {
    results.push({ editor: ExternalEditor.Atom, path: atomPath })
  }

  if (codePath) {
    results.push({ editor: ExternalEditor.VisualStudioCode, path: codePath })
  }

  if (sublimePath) {
    results.push({ editor: ExternalEditor.SublimeText, path: sublimePath })
  }

  return results
}
