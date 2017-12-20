import * as Path from 'path'
import { pathExists } from '../file-system'
import { IFoundEditor } from './found-editor'
import { assertNever } from '../fatal-error'

export enum ExternalEditor {
  Atom = 'Atom',
  VisualStudioCode = 'Visual Studio Code',
  VisualStudioCodeInsiders = 'Visual Studio Code (Insiders)',
  SublimeText = 'Sublime Text',
  BBEdit = 'BBEdit',
}

export function parse(label: string): ExternalEditor | null {
  if (label === ExternalEditor.Atom) {
    return ExternalEditor.Atom
  }
  if (label === ExternalEditor.VisualStudioCode) {
    return ExternalEditor.VisualStudioCode
  }
  if (label === ExternalEditor.VisualStudioCodeInsiders) {
    return ExternalEditor.VisualStudioCodeInsiders
  }
  if (label === ExternalEditor.SublimeText) {
    return ExternalEditor.SublimeText
  }
  if (label === ExternalEditor.BBEdit) {
    return ExternalEditor.BBEdit
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
      return ['com.microsoft.VSCode']
    case ExternalEditor.VisualStudioCodeInsiders:
      return ['com.microsoft.VSCodeInsiders']
    case ExternalEditor.SublimeText:
      return ['com.sublimetext.3']
    case ExternalEditor.BBEdit:
      return ['com.barebones.bbedit']
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
    case ExternalEditor.VisualStudioCodeInsiders:
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
    case ExternalEditor.BBEdit:
      return Path.join(installPath, 'Contents', 'Helpers', 'bbedit_tool')
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

  const [
    atomPath,
    codePath,
    codeInsidersPath,
    sublimePath,
    bbeditPath,
  ] = await Promise.all([
    findApplication(ExternalEditor.Atom),
    findApplication(ExternalEditor.VisualStudioCode),
    findApplication(ExternalEditor.VisualStudioCodeInsiders),
    findApplication(ExternalEditor.SublimeText),
    findApplication(ExternalEditor.BBEdit),
  ])

  if (atomPath) {
    results.push({ editor: ExternalEditor.Atom, path: atomPath })
  }

  if (codePath) {
    results.push({ editor: ExternalEditor.VisualStudioCode, path: codePath })
  }

  if (codeInsidersPath) {
    results.push({
      editor: ExternalEditor.VisualStudioCodeInsiders,
      path: codeInsidersPath,
    })
  }

  if (sublimePath) {
    results.push({ editor: ExternalEditor.SublimeText, path: sublimePath })
  }

  if (bbeditPath) {
    results.push({ editor: ExternalEditor.BBEdit, path: bbeditPath })
  }

  return results
}
