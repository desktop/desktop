import * as Path from 'path'
import { pathExists } from 'fs-extra'
import { IFoundEditor } from './found-editor'
import { assertNever } from '../fatal-error'
import appPath from 'app-path'

export enum ExternalEditor {
  Atom = 'Atom',
  MacVim = 'MacVim',
  VSCode = 'Visual Studio Code',
  VSCodeInsiders = 'Visual Studio Code (Insiders)',
  VSCodium = 'VSCodium',
  SublimeText = 'Sublime Text',
  BBEdit = 'BBEdit',
  PhpStorm = 'PhpStorm',
  PyCharm = 'PyCharm',
  RubyMine = 'RubyMine',
  TextMate = 'TextMate',
  Brackets = 'Brackets',
  WebStorm = 'WebStorm',
  Typora = 'Typora',
  CodeRunner = 'CodeRunner',
  SlickEdit = 'SlickEdit',
  IntelliJ = 'IntelliJ',
  Xcode = 'Xcode',
  GoLand = 'GoLand',
  AndroidStudio = 'Android Studio',
  Rider = 'Rider',
  Nova = 'Nova',
}

export function parse(label: string): ExternalEditor | null {
  if (label === ExternalEditor.Atom) {
    return ExternalEditor.Atom
  }
  if (label === ExternalEditor.MacVim) {
    return ExternalEditor.MacVim
  }
  if (label === ExternalEditor.VSCode) {
    return ExternalEditor.VSCode
  }
  if (label === ExternalEditor.VSCodeInsiders) {
    return ExternalEditor.VSCodeInsiders
  }

  if (label === ExternalEditor.VSCodium) {
    return ExternalEditor.VSCodium
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
  if (label === ExternalEditor.PyCharm) {
    return ExternalEditor.PyCharm
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
  if (label === ExternalEditor.CodeRunner) {
    return ExternalEditor.CodeRunner
  }
  if (label === ExternalEditor.SlickEdit) {
    return ExternalEditor.SlickEdit
  }
  if (label === ExternalEditor.IntelliJ) {
    return ExternalEditor.IntelliJ
  }
  if (label === ExternalEditor.Xcode) {
    return ExternalEditor.Xcode
  }
  if (label === ExternalEditor.GoLand) {
    return ExternalEditor.GoLand
  }
  if (label === ExternalEditor.AndroidStudio) {
    return ExternalEditor.AndroidStudio
  }
  if (label === ExternalEditor.Rider) {
    return ExternalEditor.Rider
  }
  if (label === ExternalEditor.Nova) {
    return ExternalEditor.Nova
  }
  return null
}

function getBundleIdentifiers(editor: ExternalEditor): ReadonlyArray<string> {
  switch (editor) {
    case ExternalEditor.Atom:
      return ['com.github.atom']
    case ExternalEditor.MacVim:
      return ['org.vim.MacVim']
    case ExternalEditor.VSCode:
      return ['com.microsoft.VSCode']
    case ExternalEditor.VSCodeInsiders:
      return ['com.microsoft.VSCodeInsiders']
    case ExternalEditor.VSCodium:
      return ['com.visualstudio.code.oss']
    case ExternalEditor.SublimeText:
      return ['com.sublimetext.3']
    case ExternalEditor.BBEdit:
      return ['com.barebones.bbedit']
    case ExternalEditor.PhpStorm:
      return ['com.jetbrains.PhpStorm']
    case ExternalEditor.PyCharm:
      return ['com.jetbrains.PyCharm']
    case ExternalEditor.RubyMine:
      return ['com.jetbrains.RubyMine']
    case ExternalEditor.IntelliJ:
      return ['com.jetbrains.intellij']
    case ExternalEditor.TextMate:
      return ['com.macromates.TextMate']
    case ExternalEditor.Brackets:
      return ['io.brackets.appshell']
    case ExternalEditor.WebStorm:
      return ['com.jetbrains.WebStorm']
    case ExternalEditor.Typora:
      return ['abnerworks.Typora']
    case ExternalEditor.CodeRunner:
      return ['com.krill.CodeRunner']
    case ExternalEditor.SlickEdit:
      return [
        'com.slickedit.SlickEditPro2018',
        'com.slickedit.SlickEditPro2017',
        'com.slickedit.SlickEditPro2016',
        'com.slickedit.SlickEditPro2015',
      ]
    case ExternalEditor.Xcode:
      return ['com.apple.dt.Xcode']
    case ExternalEditor.GoLand:
      return ['com.jetbrains.goland']
    case ExternalEditor.AndroidStudio:
      return ['com.google.android.studio']
    case ExternalEditor.Rider:
      return ['com.jetbrains.rider']
    case ExternalEditor.Nova:
      return ['com.panic.Nova']
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
    case ExternalEditor.VSCode:
    case ExternalEditor.VSCodeInsiders:
      return Path.join(
        installPath,
        'Contents',
        'Resources',
        'app',
        'bin',
        'code'
      )
    case ExternalEditor.VSCodium:
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
    case ExternalEditor.PyCharm:
      return Path.join(installPath, 'Contents', 'MacOS', 'pycharm')
    case ExternalEditor.RubyMine:
      return Path.join(installPath, 'Contents', 'MacOS', 'rubymine')
    case ExternalEditor.TextMate:
      return Path.join(installPath, 'Contents', 'Resources', 'mate')
    case ExternalEditor.Brackets:
      return Path.join(installPath, 'Contents', 'MacOS', 'Brackets')
    case ExternalEditor.WebStorm:
      return Path.join(installPath, 'Contents', 'MacOS', 'WebStorm')
    case ExternalEditor.IntelliJ:
      return Path.join(installPath, 'Contents', 'MacOS', 'idea')
    case ExternalEditor.Typora:
      return Path.join(installPath, 'Contents', 'MacOS', 'Typora')
    case ExternalEditor.CodeRunner:
      return Path.join(installPath, 'Contents', 'MacOS', 'CodeRunner')
    case ExternalEditor.SlickEdit:
      return Path.join(installPath, 'Contents', 'MacOS', 'vs')
    case ExternalEditor.Xcode:
      return '/usr/bin/xed'
    case ExternalEditor.GoLand:
      return Path.join(installPath, 'Contents', 'MacOS', 'goland')
    case ExternalEditor.AndroidStudio:
      return Path.join(installPath, 'Contents', 'MacOS', 'studio')
    case ExternalEditor.Rider:
      return Path.join(installPath, 'Contents', 'MacOS', 'rider')
    case ExternalEditor.Nova:
      return Path.join(installPath, 'Contents', 'SharedSupport', 'nova')
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
    codiumPath,
    sublimePath,
    bbeditPath,
    phpStormPath,
    pyCharmPath,
    rubyMinePath,
    textMatePath,
    bracketsPath,
    webStormPath,
    typoraPath,
    codeRunnerPath,
    slickeditPath,
    intellijPath,
    xcodePath,
    golandPath,
    androidStudioPath,
    riderPath,
    novaPath,
  ] = await Promise.all([
    findApplication(ExternalEditor.Atom),
    findApplication(ExternalEditor.MacVim),
    findApplication(ExternalEditor.VSCode),
    findApplication(ExternalEditor.VSCodeInsiders),
    findApplication(ExternalEditor.VSCodium),
    findApplication(ExternalEditor.SublimeText),
    findApplication(ExternalEditor.BBEdit),
    findApplication(ExternalEditor.PhpStorm),
    findApplication(ExternalEditor.PyCharm),
    findApplication(ExternalEditor.RubyMine),
    findApplication(ExternalEditor.TextMate),
    findApplication(ExternalEditor.Brackets),
    findApplication(ExternalEditor.WebStorm),
    findApplication(ExternalEditor.Typora),
    findApplication(ExternalEditor.CodeRunner),
    findApplication(ExternalEditor.SlickEdit),
    findApplication(ExternalEditor.IntelliJ),
    findApplication(ExternalEditor.Xcode),
    findApplication(ExternalEditor.GoLand),
    findApplication(ExternalEditor.AndroidStudio),
    findApplication(ExternalEditor.Rider),
    findApplication(ExternalEditor.Nova),
  ])

  if (atomPath) {
    results.push({ editor: ExternalEditor.Atom, path: atomPath })
  }

  if (macVimPath) {
    results.push({ editor: ExternalEditor.MacVim, path: macVimPath })
  }

  if (codePath) {
    results.push({ editor: ExternalEditor.VSCode, path: codePath })
  }

  if (codeInsidersPath) {
    results.push({
      editor: ExternalEditor.VSCodeInsiders,
      path: codeInsidersPath,
    })
  }

  if (codiumPath) {
    results.push({ editor: ExternalEditor.VSCodium, path: codiumPath })
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

  if (pyCharmPath) {
    results.push({ editor: ExternalEditor.PyCharm, path: pyCharmPath })
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

  if (codeRunnerPath) {
    results.push({ editor: ExternalEditor.CodeRunner, path: codeRunnerPath })
  }

  if (slickeditPath) {
    results.push({ editor: ExternalEditor.SlickEdit, path: slickeditPath })
  }

  if (intellijPath) {
    results.push({ editor: ExternalEditor.IntelliJ, path: intellijPath })
  }

  if (xcodePath) {
    results.push({ editor: ExternalEditor.Xcode, path: xcodePath })
  }

  if (golandPath) {
    results.push({ editor: ExternalEditor.GoLand, path: golandPath })
  }

  if (androidStudioPath) {
    results.push({
      editor: ExternalEditor.AndroidStudio,
      path: androidStudioPath,
    })
  }

  if (riderPath) {
    results.push({ editor: ExternalEditor.Rider, path: riderPath })
  }

  if (novaPath) {
    results.push({ editor: ExternalEditor.Nova, path: novaPath })
  }

  return results
}
