import * as Path from 'path'
import { pathExists } from 'fs-extra'
import { IFoundEditor } from './found-editor'
import { assertNever } from '../fatal-error'

export enum ExternalEditor {
  Atom = 'Atom',
  MacVim = 'MacVim',
  VisualStudioCode = 'Visual Studio Code',
  VisualStudioCodeInsiders = 'Visual Studio Code (Insiders)',
  SublimeText = 'Sublime Text',
  BBEdit = 'BBEdit',
  PhpStorm = 'PhpStorm',
  RubyMine = 'RubyMine',
  TextMate = 'TextMate',
  Brackets = 'Brackets',
  WebStorm = 'WebStorm',
  Typora = 'Typora',
  SlickEdit = 'Visual SlickEdit',
}

export function parse(label: string): ExternalEditor | null {
  if (label === ExternalEditor.Atom) {
    return ExternalEditor.Atom
  }
  if (label === ExternalEditor.MacVim) {
    return ExternalEditor.MacVim
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
  if (label === ExternalEditor.PhpStorm) {
    return ExternalEditor.PhpStorm
  }
  if (label === ExternalEditor.RubyMine) {
    return ExternalEditor.RubyMine
  }
  if (label === ExternalEditor.TextMate) {
    return ExternalEditor.TextMate
  }
  if (label === ExternalEditor.Brackets) {
    return ExternalEditor.Brackets
  }
  if (label === ExternalEditor.WebStorm) {
    return ExternalEditor.WebStorm
  }
  if (label === ExternalEditor.Typora) {
    return ExternalEditor.Typora
  }
  if (label === ExternalEditor.SlickEdit) {
    return ExternalEditor.SlickEdit
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
    case ExternalEditor.MacVim:
      return ['org.vim.MacVim']
    case ExternalEditor.VisualStudioCode:
      return ['com.microsoft.VSCode']
    case ExternalEditor.VisualStudioCodeInsiders:
      return ['com.microsoft.VSCodeInsiders']
    case ExternalEditor.SublimeText:
      return ['com.sublimetext.3']
    case ExternalEditor.BBEdit:
      return ['com.barebones.bbedit']
    case ExternalEditor.PhpStorm:
      return ['com.jetbrains.PhpStorm']
    case ExternalEditor.RubyMine:
      return ['com.jetbrains.RubyMine']
    case ExternalEditor.TextMate:
      return ['com.macromates.TextMate']
    case ExternalEditor.Brackets:
      return ['io.brackets.appshell']
    case ExternalEditor.WebStorm:
      return ['com.jetbrains.WebStorm']
    case ExternalEditor.Typora:
      return ['abnerworks.Typora']
    case ExternalEditor.SlickEdit:
      return [
        'com.slickedit.SlickEditPro2018',
        'com.slickedit.SlickEditPro2017',
        'com.slickedit.SlickEditPro2016',
        'com.slickedit.SlickEditPro2015',
      ]
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
    case ExternalEditor.MacVim:
      return Path.join(installPath, 'Contents', 'MacOS', 'MacVim')
    case ExternalEditor.SublimeText:
      return Path.join(installPath, 'Contents', 'SharedSupport', 'bin', 'subl')
    case ExternalEditor.BBEdit:
      return Path.join(installPath, 'Contents', 'Helpers', 'bbedit_tool')
    case ExternalEditor.PhpStorm:
      return Path.join(installPath, 'Contents', 'MacOS', 'phpstorm')
    case ExternalEditor.RubyMine:
      return Path.join(installPath, 'Contents', 'MacOS', 'rubymine')
    case ExternalEditor.TextMate:
      return Path.join(installPath, 'Contents', 'Resources', 'mate')
    case ExternalEditor.Brackets:
      return Path.join(installPath, 'Contents', 'MacOS', 'Brackets')
    case ExternalEditor.WebStorm:
      return Path.join(installPath, 'Contents', 'MacOS', 'WebStorm')
    case ExternalEditor.Typora:
      return Path.join(installPath, 'Contents', 'MacOS', 'Typora')
    case ExternalEditor.SlickEdit:
      return Path.join(installPath, 'Contents', 'MacOS', 'vs')
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
    macVimPath,
    codePath,
    codeInsidersPath,
    sublimePath,
    bbeditPath,
    phpStormPath,
    rubyMinePath,
    textMatePath,
    bracketsPath,
    webStormPath,
    typoraPath,
    slickeditPath,
  ] = await Promise.all([
    findApplication(ExternalEditor.Atom),
    findApplication(ExternalEditor.MacVim),
    findApplication(ExternalEditor.VisualStudioCode),
    findApplication(ExternalEditor.VisualStudioCodeInsiders),
    findApplication(ExternalEditor.SublimeText),
    findApplication(ExternalEditor.BBEdit),
    findApplication(ExternalEditor.PhpStorm),
    findApplication(ExternalEditor.RubyMine),
    findApplication(ExternalEditor.TextMate),
    findApplication(ExternalEditor.Brackets),
    findApplication(ExternalEditor.WebStorm),
    findApplication(ExternalEditor.Typora),
    findApplication(ExternalEditor.SlickEdit),
  ])

  if (atomPath) {
    results.push({ editor: ExternalEditor.Atom, path: atomPath })
  }

  if (macVimPath) {
    results.push({ editor: ExternalEditor.MacVim, path: macVimPath })
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

  if (phpStormPath) {
    results.push({ editor: ExternalEditor.PhpStorm, path: phpStormPath })
  }

  if (rubyMinePath) {
    results.push({ editor: ExternalEditor.RubyMine, path: rubyMinePath })
  }

  if (textMatePath) {
    results.push({ editor: ExternalEditor.TextMate, path: textMatePath })
  }

  if (bracketsPath) {
    results.push({ editor: ExternalEditor.Brackets, path: bracketsPath })
  }

  if (webStormPath) {
    results.push({ editor: ExternalEditor.WebStorm, path: webStormPath })
  }

  if (typoraPath) {
    results.push({ editor: ExternalEditor.Typora, path: typoraPath })
  }

  if (slickeditPath) {
    results.push({ editor: ExternalEditor.SlickEdit, path: slickeditPath })
  }

  return results
}
