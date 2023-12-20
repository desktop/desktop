import { pathExists } from '../helpers/linux'

import { IFoundEditor } from './found-editor'

/** Represents an external editor on Linux */
interface ILinuxExternalEditor {
  /** Name of the editor. It will be used both as identifier and user-facing. */
  readonly name: string

  /** List of possible paths where the editor's executable might be located. */
  readonly paths: string[]
}

/**
 * This list contains all the external editors supported on Linux. Add a new
 * entry here to add support for your favorite editor.
 **/
const editors: ILinuxExternalEditor[] = [
  {
    name: 'Atom',
    paths: ['/snap/bin/atom', '/usr/bin/atom'],
  },
  {
    name: 'Neovim',
    paths: ['/usr/bin/nvim'],
  },
  {
    name: 'Neovim-Qt',
    paths: ['/usr/bin/nvim-qt'],
  },
  {
    name: 'Neovide',
    paths: ['/usr/bin/neovide'],
  },
  {
    name: 'gVim',
    paths: ['/usr/bin/gvim'],
  },
  {
    name: 'Visual Studio Code',
    paths: [
      '/usr/share/code/bin/code',
      '/snap/bin/code',
      '/usr/bin/code',
      '/mnt/c/Program Files/Microsoft VS Code/bin/code',
      '/var/lib/flatpak/app/com.visualstudio.code/current/active/export/bin/com.visualstudio.code',
      '.local/share/flatpak/app/com.visualstudio.code/current/active/export/bin/com.visualstudio.code',
    ],
  },
  {
    name: 'Visual Studio Code (Insiders)',
    paths: [
      '/snap/bin/code-insiders',
      '/usr/bin/code-insiders',
      '/var/lib/flatpak/app/com.visualstudio.code.insiders/current/active/export/bin/com.visualstudio.code.insiders',
      '.local/share/flatpak/app/com.visualstudio.code.insiders/current/active/export/bin/com.visualstudio.code.insiders',
    ],
  },
  {
    name: 'VSCodium',
    paths: [
      '/usr/bin/codium',
      '/var/lib/flatpak/app/com.vscodium.codium/current/active/export/bin/com.vscodium.codium',
      '/usr/share/vscodium-bin/bin/codium',
      '.local/share/flatpak/app/com.vscodium.codium/current/active/export/bin/com.vscodium.codium',
    ],
  },
  {
    name: 'VSCodium (Insiders)',
    paths: ['/usr/bin/codium-insiders'],
  },
  {
    name: 'Sublime Text',
    paths: ['/usr/bin/subl'],
  },
  {
    name: 'Typora',
    paths: ['/usr/bin/typora'],
  },
  {
    name: 'SlickEdit',
    paths: [
      '/opt/slickedit-pro2018/bin/vs',
      '/opt/slickedit-pro2017/bin/vs',
      '/opt/slickedit-pro2016/bin/vs',
      '/opt/slickedit-pro2015/bin/vs',
    ],
  },
  {
    // Code editor for elementary OS
    // https://github.com/elementary/code
    name: 'Code',
    paths: ['/usr/bin/io.elementary.code'],
  },
  {
    name: 'Lite XL',
    paths: ['/usr/bin/lite-xl'],
  },
  {
    name: 'JetBrains PhpStorm',
    paths: [
      '/snap/bin/phpstorm',
      '.local/share/JetBrains/Toolbox/scripts/phpstorm',
    ],
  },
  {
    name: 'JetBrains WebStorm',
    paths: [
      '/snap/bin/webstorm',
      '.local/share/JetBrains/Toolbox/scripts/webstorm',
    ],
  },
  {
    name: 'IntelliJ IDEA',
    paths: ['/snap/bin/idea', '.local/share/JetBrains/Toolbox/scripts/idea'],
  },
  {
    name: 'IntelliJ IDEA Ultimate Edition',
    paths: [
      '/snap/bin/intellij-idea-ultimate',
      '.local/share/JetBrains/Toolbox/scripts/intellij-idea-ultimate',
    ],
  },
  {
    name: 'IntelliJ Goland',
    paths: [
      '/snap/bin/goland',
      '.local/share/JetBrains/Toolbox/scripts/goland',
    ],
  },
  {
    name: 'JetBrains PyCharm',
    paths: [
      '/snap/bin/pycharm',
      '.local/share/JetBrains/Toolbox/scripts/pycharm',
    ],
  },
  {
    name: 'Android Studio',
    paths: [
      '/snap/bin/studio',
      '.local/share/JetBrains/Toolbox/scripts/studio',
    ],
  },
  {
    name: 'Emacs',
    paths: ['/snap/bin/emacs', '/usr/local/bin/emacs', '/usr/bin/emacs'],
  },
  {
    name: 'Kate',
    paths: ['/usr/bin/kate'],
  },
  {
    name: 'GEdit',
    paths: ['/usr/bin/gedit'],
  },
  {
    name: 'GNOME Text Editor',
    paths: ['/usr/bin/gnome-text-editor'],
  },
  {
    name: 'GNOME Builder',
    paths: ['/usr/bin/gnome-builder'],
  },
  {
    name: 'Notepadqq',
    paths: ['/usr/bin/notepadqq'],
  },
  {
    name: 'Mousepad',
    paths: ['/usr/bin/mousepad'],
  },
  {
    name: 'Pulsar',
    paths: ['/usr/bin/pulsar'],
  },
]

async function getAvailablePath(paths: string[]): Promise<string | null> {
  for (const path of paths) {
    if (await pathExists(path)) {
      return path
    }
  }

  return null
}

export async function getAvailableEditors(): Promise<
  ReadonlyArray<IFoundEditor<string>>
> {
  const results: Array<IFoundEditor<string>> = []

  for (const editor of editors) {
    const path = await getAvailablePath(editor.paths)
    if (path) {
      results.push({ editor: editor.name, path })
    }
  }

  return results
}
