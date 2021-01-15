import { pathExists } from 'fs-extra'
import { IFoundEditor } from './found-editor'
import appPath from 'app-path'
import { parseEnumValue } from '../enum'

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

interface IDarwinExternalEditor {
  readonly name: ExternalEditor
  readonly bundleIdentifiers: string[]
}

export const editors: IDarwinExternalEditor[] = [
  {
    name: ExternalEditor.Atom,
    bundleIdentifiers: ['com.github.atom'],
  },
  {
    name: ExternalEditor.MacVim,
    bundleIdentifiers: ['org.vim.MacVim'],
  },
  {
    name: ExternalEditor.VSCode,
    bundleIdentifiers: ['com.microsoft.VSCode'],
  },
  {
    name: ExternalEditor.VSCodeInsiders,
    bundleIdentifiers: ['com.microsoft.VSCodeInsiders'],
  },
  {
    name: ExternalEditor.VSCodium,
    bundleIdentifiers: ['com.visualstudio.code.oss'],
  },
  {
    name: ExternalEditor.SublimeText,
    bundleIdentifiers: [
      'com.sublimetext.4',
      'com.sublimetext.3',
      'com.sublimetext.2',
    ],
  },
  {
    name: ExternalEditor.BBEdit,
    bundleIdentifiers: ['com.barebones.bbedit'],
  },
  {
    name: ExternalEditor.PhpStorm,
    bundleIdentifiers: ['com.jetbrains.PhpStorm'],
  },
  {
    name: ExternalEditor.PyCharm,
    bundleIdentifiers: ['com.jetbrains.PyCharm'],
  },
  {
    name: ExternalEditor.RubyMine,
    bundleIdentifiers: ['com.jetbrains.RubyMine'],
  },
  {
    name: ExternalEditor.IntelliJ,
    bundleIdentifiers: ['com.jetbrains.intellij'],
  },
  {
    name: ExternalEditor.TextMate,
    bundleIdentifiers: ['com.macromates.TextMate'],
  },
  {
    name: ExternalEditor.Brackets,
    bundleIdentifiers: ['io.brackets.appshell'],
  },
  {
    name: ExternalEditor.WebStorm,
    bundleIdentifiers: ['com.jetbrains.WebStorm'],
  },
  {
    name: ExternalEditor.Typora,
    bundleIdentifiers: ['abnerworks.Typora'],
  },
  {
    name: ExternalEditor.CodeRunner,
    bundleIdentifiers: ['com.krill.CodeRunner'],
  },
  {
    name: ExternalEditor.SlickEdit,
    bundleIdentifiers: [
      'com.slickedit.SlickEditPro2018',
      'com.slickedit.SlickEditPro2017',
      'com.slickedit.SlickEditPro2016',
      'com.slickedit.SlickEditPro2015',
    ],
  },
  {
    name: ExternalEditor.Xcode,
    bundleIdentifiers: ['com.apple.dt.Xcode'],
  },
  {
    name: ExternalEditor.GoLand,
    bundleIdentifiers: ['com.jetbrains.goland'],
  },
  {
    name: ExternalEditor.AndroidStudio,
    bundleIdentifiers: ['com.google.android.studio'],
  },
  {
    name: ExternalEditor.Rider,
    bundleIdentifiers: ['com.jetbrains.rider'],
  },
  {
    name: ExternalEditor.Nova,
    bundleIdentifiers: ['com.panic.Nova'],
  },
]

export function parse(label: string): ExternalEditor | null {
  return parseEnumValue(ExternalEditor, label) ?? null
}

async function findApplication(
  editor: IDarwinExternalEditor
): Promise<string | null> {
  for (const identifier of editor.bundleIdentifiers) {
    try {
      const installPath = await appPath(identifier)
      const exists = await pathExists(installPath)
      if (exists) {
        return installPath
      }

      log.debug(`App instalation for ${editor} not found at '${installPath}'`)
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

  const editorPaths = await Promise.all(
    editors.map(editor =>
      findApplication(editor).then(path => {
        return { editor, path }
      })
    )
  )

  for (const editorPath of editorPaths) {
    const { editor, path } = editorPath

    if (path) {
      results.push({
        editor: editor.name,
        path: path,
      })
    }
  }

  return results
}
