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
    name: 'Eclipse IDE for Java Developers',
    bundleIdentifiers: ['epp.package.java'],
  },
  {
    name: 'Eclipse IDE for Enterprise Java and Web Developers',
    bundleIdentifiers: ['epp.package.jee'],
  },
  {
    name: 'Eclipse IDE for C/C++ Developers',
    bundleIdentifiers: ['epp.package.cpp'],
  },
  {
    name: 'Eclipse IDE for Eclipse Committers',
    bundleIdentifiers: ['epp.package.committers'],
  },
  {
    name: 'Eclipse IDE for Embedded C/C++ Developers',
    bundleIdentifiers: ['epp.package.embedcpp'],
  },
  {
    name: 'Eclipse IDE for PHP Developers',
    bundleIdentifiers: ['epp.package.php'],
  },
  {
    name: 'Eclipse IDE for Java and DSL Developers',
    bundleIdentifiers: ['epp.package.dsl'],
  },
  {
    name: 'Eclipse IDE for RCP and RAP Developers',
    bundleIdentifiers: ['epp.package.rcp'],
  },
  {
    name: 'Eclipse Modeling Tools',
    bundleIdentifiers: ['epp.package.modeling'],
  },
  {
    name: 'Eclipse IDE for Scientific Computing',
    bundleIdentifiers: ['epp.package.parallel'],
  },
  {
    name: 'Eclipse IDE for Scout Developers',
    bundleIdentifiers: ['epp.package.scout'],
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
    name: 'VimR',
    bundleIdentifiers: ['com.qvacua.VimR'],
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
    name: 'RustRover',
    bundleIdentifiers: ['com.jetbrains.RustRover'],
  },
  {
    name: 'RStudio',
    bundleIdentifiers: ['org.rstudio.RStudio', 'com.rstudio.desktop'],
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
  {
    name: 'Pulsar',
    bundleIdentifiers: ['dev.pulsar-edit.pulsar'],
  },
  {
    name: 'Zed',
    bundleIdentifiers: ['dev.zed.Zed'],
  },
  {
    name: 'Zed (Preview)',
    bundleIdentifiers: ['dev.zed.Zed-Preview'],
  },
  {
    name: 'Cursor',
    bundleIdentifiers: ['com.todesktop.230313mzl4w4u92'],
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
