import { pathExists } from '../../ui/lib/path-exists'
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
    name: 'Aptana Studio',
    bundleIdentifiers: ['aptana.studio'],
  },
  {
    name: 'MacVim',
    bundleIdentifiers: ['org.vim.MacVim'],
  },
  {
    name: 'Neovide',
    bundleIdentifiers: ['com.neovide.neovide'],
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
    bundleIdentifiers: ['com.visualstudio.code.oss', 'com.vscodium'],
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
    name: 'PyCharm Community Edition',
    bundleIdentifiers: ['com.jetbrains.pycharm.ce'],
  },
  {
    name: 'DataSpell',
    bundleIdentifiers: ['com.jetbrains.DataSpell'],
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
    name: 'CLion',
    bundleIdentifiers: ['com.jetbrains.CLion'],
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
    name: 'IntelliJ Community Edition',
    bundleIdentifiers: ['com.jetbrains.intellij.ce'],
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
  {
    name: 'Emacs',
    bundleIdentifiers: ['org.gnu.Emacs'],
  },
  {
    name: 'Lite XL',
    bundleIdentifiers: ['com.lite-xl'],
  },
  {
    name: 'Fleet',
    bundleIdentifiers: ['Fleet.app'],
  },
]

async function findApplication(
  editor: IDarwinExternalEditor
): Promise<string | null> {
  for (const identifier of editor.bundleIdentifiers) {
    try {
      // app-path not finding the app isn't an error, it just means the
      // bundle isn't registered on the machine.
      // https://github.com/sindresorhus/app-path/blob/0e776d4e132676976b4a64e09b5e5a4c6e99fcba/index.js#L7-L13
      const installPath = await appPath(identifier).catch(e =>
        e.message === "Couldn't find the app"
          ? Promise.resolve(null)
          : Promise.reject(e)
      )

      if (installPath && (await pathExists(installPath))) {
        return installPath
      }

      log.debug(
        `App installation for ${editor.name} not found at '${installPath}'`
      )
    } catch (error) {
      log.debug(`Unable to locate ${editor.name} installation`, error)
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
