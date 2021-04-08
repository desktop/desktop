import { pathExists } from 'fs-extra'
import { IFoundEditor } from './found-editor'
import appPath from 'app-path'

/** Represents an external editor on macOS */
interface IDarwinExternalEditor {
  /** Name of the editor. It will be used both as identifier and user-facing. */
  readonly name: string

  /**
   * List of bundle identifiers that are used by the app in its multiple
   * versions.
   **/
  readonly bundleIdentifiers: string[]
}

/**
 * This list contains all the external editors supported on macOS. Add a new
 * entry here to add support for your favorite editor.
 **/
const editors: IDarwinExternalEditor[] = [
  {
    name: 'Atom',
    bundleIdentifiers: ['com.github.atom'],
  },
  {
    name: 'MacVim',
    bundleIdentifiers: ['org.vim.MacVim'],
  },
  {
    name: 'Visual Studio Code',
    bundleIdentifiers: ['com.microsoft.VSCode'],
  },
  {
    name: 'Visual Studio Code (Insiders)',
    bundleIdentifiers: ['com.microsoft.VSCodeInsiders'],
  },
  {
    name: 'VSCodium',
    bundleIdentifiers: ['com.visualstudio.code.oss'],
  },
  {
    name: 'Sublime Text',
    bundleIdentifiers: [
      'com.sublimetext.4',
      'com.sublimetext.3',
      'com.sublimetext.2',
    ],
  },
  {
    name: 'BBEdit',
    bundleIdentifiers: ['com.barebones.bbedit'],
  },
  {
    name: 'PhpStorm',
    bundleIdentifiers: ['com.jetbrains.PhpStorm'],
  },
  {
    name: 'PyCharm',
    bundleIdentifiers: ['com.jetbrains.PyCharm'],
  },
  {
    name: 'RubyMine',
    bundleIdentifiers: ['com.jetbrains.RubyMine'],
  },
  {
    name: 'RStudio',
    bundleIdentifiers: ['org.rstudio.RStudio'],
  },
  {
    name: 'TextMate',
    bundleIdentifiers: ['com.macromates.TextMate'],
  },
  {
    name: 'Brackets',
    bundleIdentifiers: ['io.brackets.appshell'],
  },
  {
    name: 'WebStorm',
    bundleIdentifiers: ['com.jetbrains.WebStorm'],
  },
  {
    name: 'Typora',
    bundleIdentifiers: ['abnerworks.Typora'],
  },
  {
    name: 'CodeRunner',
    bundleIdentifiers: ['com.krill.CodeRunner'],
  },
  {
    name: 'SlickEdit',
    bundleIdentifiers: [
      'com.slickedit.SlickEditPro2018',
      'com.slickedit.SlickEditPro2017',
      'com.slickedit.SlickEditPro2016',
      'com.slickedit.SlickEditPro2015',
    ],
  },
  {
    name: 'IntelliJ',
    bundleIdentifiers: ['com.jetbrains.intellij'],
  },
  {
    name: 'Xcode',
    bundleIdentifiers: ['com.apple.dt.Xcode'],
  },
  {
    name: 'GoLand',
    bundleIdentifiers: ['com.jetbrains.goland'],
  },
  {
    name: 'Android Studio',
    bundleIdentifiers: ['com.google.android.studio'],
  },
  {
    name: 'Rider',
    bundleIdentifiers: ['com.jetbrains.rider'],
  },
  {
    name: 'Nova',
    bundleIdentifiers: ['com.panic.Nova'],
  },
]

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

      log.debug(`App installation for ${editor} not found at '${installPath}'`)
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
  ReadonlyArray<IFoundEditor<string>>
> {
  const results: Array<IFoundEditor<string>> = []

  for (const editor of editors) {
    const path = await findApplication(editor)

    if (path) {
      results.push({ editor: editor.name, path })
    }
  }

  return results
}
