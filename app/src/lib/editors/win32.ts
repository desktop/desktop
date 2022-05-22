import * as Path from 'path'

import {
  enumerateValues,
  HKEY,
  RegistryValue,
  RegistryValueType,
} from 'registry-js'
import { pathExists } from '../../ui/lib/path-exists'

import { IFoundEditor } from './found-editor'

import { execFile } from '../exec-file'
interface IWindowsAppInformation {
  displayName: string
  publisher: string
  installLocation: string
}

type RegistryKey = { key: HKEY; subKey: string }

type WindowsExternalEditorPathInfo =
  | {
      /**
       * Registry key with the install location of the app. If not provided,
       * 'InstallLocation' or 'UninstallString' will be assumed.
       **/
      readonly installLocationRegistryKey?:
        | 'InstallLocation'
        | 'UninstallString'

      /**
       * List of lists of path components from the editor's installation folder to
       * the potential executable shims. Only needed when the install location
       * registry key is `InstallLocation`.
       **/
      readonly executableShimPaths: ReadonlyArray<ReadonlyArray<string>>
    }
  | {
      /**
       * Registry key with the install location of the app.
       **/
      readonly installLocationRegistryKey: 'DisplayIcon'
    }

/** Represents an external editor on Windows */
type WindowsExternalEditor = {
  /**
   * Set of registry keys associated with the installed application.
   *
   * Some tools (like VSCode) may support a 64-bit or 32-bit version of the
   * tool - we should use whichever they have installed.
   */
  readonly registryKeys: ReadonlyArray<RegistryKey>
} & WindowsExternalEditorPathInfo & WindowsExternalEditorGenericInfo

type WindowsExternalEditorGenericInfo = {
  /** Name of the editor. It will be used both as identifier and user-facing. */
  readonly name: string

  /** Prefix of the DisplayName registry key that belongs to this editor. */
  readonly displayNamePrefix: string

  /** Value of the Publisher registry key that belongs to this editor. */
  readonly publisher: string
}

type WindowsVisualStudioEditor = {
  readonly version: string
  readonly productId: string
} & WindowsExternalEditorGenericInfo

/* Represents the Installer for Visual Studio */
type WindowsVisualStudioInstaller = { 
} & WindowsExternalEditor

const registryKey = (key: HKEY, ...subKeys: string[]): RegistryKey => ({
  key,
  subKey: Path.win32.join(...subKeys),
})

const uninstallSubKey =
  'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'

const wow64UninstallSubKey =
  'SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'

const CurrentUserUninstallKey = (subKey: string) =>
  registryKey(HKEY.HKEY_CURRENT_USER, uninstallSubKey, subKey)

const LocalMachineUninstallKey = (subKey: string) =>
  registryKey(HKEY.HKEY_LOCAL_MACHINE, uninstallSubKey, subKey)

const Wow64LocalMachineUninstallKey = (subKey: string) =>
  registryKey(HKEY.HKEY_LOCAL_MACHINE, wow64UninstallSubKey, subKey)

// This function generates registry keys for a given JetBrains product for the
// last 2 years, assuming JetBrains makes no more than 5 major releases and
// no more than 5 minor releases per year
const registryKeysForJetBrainsIDE = (
  product: string
): ReadonlyArray<RegistryKey> => {
  const maxMajorReleasesPerYear = 5
  const maxMinorReleasesPerYear = 5
  const lastYear = new Date().getFullYear()
  const firstYear = lastYear - 2

  const result = new Array<RegistryKey>()

  for (let year = firstYear; year <= lastYear; year++) {
    for (
      let majorRelease = 1;
      majorRelease <= maxMajorReleasesPerYear;
      majorRelease++
    ) {
      for (
        let minorRelease = 0;
        minorRelease <= maxMinorReleasesPerYear;
        minorRelease++
      ) {
        let key = `${product} ${year}.${majorRelease}`
        if (minorRelease > 0) {
          key = `${key}.${minorRelease}`
        }
        result.push(Wow64LocalMachineUninstallKey(key))
        result.push(CurrentUserUninstallKey(key))
      }
    }
  }

  // Return in reverse order to prioritize newer versions
  return result.reverse()
}

// JetBrains IDEs might have 64 and/or 32 bit executables, so let's add both.
const executableShimPathsForJetBrainsIDE = (
  baseName: string
): ReadonlyArray<ReadonlyArray<string>> => {
  return [
    ['bin', `${baseName}64.exe`],
    ['bin', `${baseName}.exe`],
  ]
}

const visualStudioInstaller : WindowsVisualStudioInstaller = {
  name: 'Microsoft Visual Studio Installer',
  registryKeys: [LocalMachineUninstallKey('{6F320B93-EE3C-4826-85E0-ADF79F8D4C61}')],
  executableShimPaths: [['vswhere.exe']],
  displayNamePrefix: 'Microsoft Visual Studio Installer',
  publisher: 'Microsoft Corporation'
}

/*
  * Returns the path to VSWHERE.
  *
  * vswhere is a tool that is part of the Visual Studio Installer. It is used
  * to find the path to the Visual Studio installation. 
  * vswhere is included with the installer as of Visual Studio 2017 version 15.2 and later
  * https://github.com/microsoft/vswhere
  * 
  */
const getPathToVsWhere = async (visualStudioInstaller:WindowsVisualStudioInstaller): Promise<string | null> => {
    const path = await findApplication(visualStudioInstaller)
    if (!path) {
      log.debug('Visual Studio Installer not found');
    } 
    return path;
}

/* 
 * This list contains the list of Visual Studio IDEs that we support. 
 * Add a new entry here to add support for a new Visual Studio version.
 * 
 * To find the product ID, please consult the following link:
 * https://docs.microsoft.com/en-us/visualstudio/install/workload-and-component-ids?view=vs-2022 
 * (change the year at the end of the url to the year you want)
 * 
 * To find the version, please consult the following link:
 * https://docs.microsoft.com/en-us/visualstudio/install/visual-studio-build-numbers-and-release-dates?view=vs-2022
 * (change the year at the end of the url to the year you want)
 */
const visualStudioEditors : WindowsVisualStudioEditor[] = [
  {
    name: 'Visual Studio Community 2022',
    displayNamePrefix: 'Microsoft Visual Studio Code',
    publisher: 'Microsoft Corporation',
    version: '17',
    productId: 'Microsoft.VisualStudio.Product.Community',
  },
  {
    name: 'Visual Studio Community 2019',
    displayNamePrefix: 'Microsoft Visual Studio Code',
    publisher: 'Microsoft Corporation',
    version: '16',
    productId: 'Microsoft.VisualStudio.Product.Community',
  },
  {
    name: 'Visual Studio Community 2017',
    displayNamePrefix: 'Microsoft Visual Studio Code',
    publisher: 'Microsoft Corporation',
    version: '15',
    productId: 'Microsoft.VisualStudio.Product.Community',
  },
  {
    name: 'Visual Studio Professional 2022',
    displayNamePrefix: 'Microsoft Visual Studio Code',
    publisher: 'Microsoft Corporation',
    version: '17',
    productId: 'Microsoft.VisualStudio.Product.Professional',
  },
  {
    name: 'Visual Studio Professional 2019',
    displayNamePrefix: 'Microsoft Visual Studio Code',
    publisher: 'Microsoft Corporation',
    version: '16',
    productId: 'Microsoft.VisualStudio.Product.Professional',
  },
  {
    name: 'Visual Studio Professional 2017',
    displayNamePrefix: 'Microsoft Visual Studio Code',
    publisher: 'Microsoft Corporation',
    version: '15',
    productId: 'Microsoft.VisualStudio.Product.Professional',
  },
  {
    name: 'Visual Studio Enterprise 2022',
    displayNamePrefix: 'Microsoft Visual Studio Code',
    publisher: 'Microsoft Corporation',
    version: '17',
    productId: 'Microsoft.VisualStudio.Product.Enterprise',
  },
  {
    name: 'Visual Studio Enterprise 2019',
    displayNamePrefix: 'Microsoft Visual Studio Code',
    publisher: 'Microsoft Corporation',
    version: '16',
    productId: 'Microsoft.VisualStudio.Product.Enterprise',
  },
  {
    name: 'Visual Studio Enterprise 2017',
    displayNamePrefix: 'Microsoft Visual Studio Code',
    publisher: 'Microsoft Corporation',
    version: '15',
    productId: 'Microsoft.VisualStudio.Product.Enterprise',
  }
]

/**
 * This list contains all the external editors supported on Windows. Add a new
 * entry here to add support for your favorite editor.
 **/
const editors: WindowsExternalEditor[] = [
  {
    name: 'Atom',
    registryKeys: [CurrentUserUninstallKey('atom')],
    executableShimPaths: [['bin', 'atom.cmd']],
    displayNamePrefix: 'Atom',
    publisher: 'GitHub Inc.',
  },
  {
    name: 'Atom Beta',
    registryKeys: [CurrentUserUninstallKey('atom-beta')],
    executableShimPaths: [['bin', 'atom-beta.cmd']],
    displayNamePrefix: 'Atom Beta',
    publisher: 'GitHub Inc.',
  },
  {
    name: 'Atom Nightly',
    registryKeys: [CurrentUserUninstallKey('atom-nightly')],
    executableShimPaths: [['bin', 'atom-nightly.cmd']],
    displayNamePrefix: 'Atom Nightly',
    publisher: 'GitHub Inc.',
  },
  {
    name: 'Visual Studio Code',
    registryKeys: [
      // 64-bit version of VSCode (user) - provided by default in 64-bit Windows
      CurrentUserUninstallKey('{771FD6B0-FA20-440A-A002-3B3BAC16DC50}_is1'),
      // 32-bit version of VSCode (user)
      CurrentUserUninstallKey('{D628A17A-9713-46BF-8D57-E671B46A741E}_is1'),
      // ARM64 version of VSCode (user)
      CurrentUserUninstallKey('{D9E514E7-1A56-452D-9337-2990C0DC4310}_is1'),
      // 64-bit version of VSCode (system) - was default before user scope installation
      LocalMachineUninstallKey('{EA457B21-F73E-494C-ACAB-524FDE069978}_is1'),
      // 32-bit version of VSCode (system)
      Wow64LocalMachineUninstallKey(
        '{F8A2A208-72B3-4D61-95FC-8A65D340689B}_is1'
      ),
      // ARM64 version of VSCode (system)
      LocalMachineUninstallKey('{A5270FC5-65AD-483E-AC30-2C276B63D0AC}_is1'),
    ],
    executableShimPaths: [['bin', 'code.cmd']],
    displayNamePrefix: 'Microsoft Visual Studio Code',
    publisher: 'Microsoft Corporation',
  },
  {
    name: 'Visual Studio Code (Insiders)',
    registryKeys: [
      // 64-bit version of VSCode (user) - provided by default in 64-bit Windows
      CurrentUserUninstallKey('{217B4C08-948D-4276-BFBB-BEE930AE5A2C}_is1'),
      // 32-bit version of VSCode (user)
      CurrentUserUninstallKey('{26F4A15E-E392-4887-8C09-7BC55712FD5B}_is1'),
      // ARM64 version of VSCode (user)
      CurrentUserUninstallKey('{69BD8F7B-65EB-4C6F-A14E-44CFA83712C0}_is1'),
      // 64-bit version of VSCode (system) - was default before user scope installation
      LocalMachineUninstallKey('{1287CAD5-7C8D-410D-88B9-0D1EE4A83FF2}_is1'),
      // 32-bit version of VSCode (system)
      Wow64LocalMachineUninstallKey(
        '{C26E74D1-022E-4238-8B9D-1E7564A36CC9}_is1'
      ),
      // ARM64 version of VSCode (system)
      LocalMachineUninstallKey('{0AEDB616-9614-463B-97D7-119DD86CCA64}_is1'),
    ],
    executableShimPaths: [['bin', 'code-insiders.cmd']],
    displayNamePrefix: 'Microsoft Visual Studio Code Insiders',
    publisher: 'Microsoft Corporation',
  },
  {
    name: 'Visual Studio Codium',
    registryKeys: [
      // 64-bit version of VSCodium (user)
      CurrentUserUninstallKey('{2E1F05D1-C245-4562-81EE-28188DB6FD17}_is1'),
      // 32-bit version of VSCodium (user)
      CurrentUserUninstallKey('{C6065F05-9603-4FC4-8101-B9781A25D88E}}_is1'),
      // ARM64 version of VSCodium (user)
      CurrentUserUninstallKey('{3AEBF0C8-F733-4AD4-BADE-FDB816D53D7B}_is1'),
      // 64-bit version of VSCodium (system)
      LocalMachineUninstallKey('{D77B7E06-80BA-4137-BCF4-654B95CCEBC5}_is1'),
      // 32-bit version of VSCodium (system)
      Wow64LocalMachineUninstallKey(
        '{E34003BB-9E10-4501-8C11-BE3FAA83F23F}_is1'
      ),
      // ARM64 version of VSCodium (system)
      LocalMachineUninstallKey('{D1ACE434-89C5-48D1-88D3-E2991DF85475}_is1'),
    ],
    executableShimPaths: [['bin', 'codium.cmd']],
    displayNamePrefix: 'VSCodium',
    publisher: 'Microsoft Corporation',
  },
  {
    name: 'Sublime Text',
    registryKeys: [
      // Sublime Text 4 (and newer?)
      LocalMachineUninstallKey('Sublime Text_is1'),
      // Sublime Text 3
      LocalMachineUninstallKey('Sublime Text 3_is1'),
    ],
    executableShimPaths: [['subl.exe']],
    displayNamePrefix: 'Sublime Text',
    publisher: 'Sublime HQ Pty Ltd',
  },
  {
    name: 'Brackets',
    registryKeys: [
      Wow64LocalMachineUninstallKey('{4F3B6E8C-401B-4EDE-A423-6481C239D6FF}'),
    ],
    executableShimPaths: [['Brackets.exe']],
    displayNamePrefix: 'Brackets',
    publisher: 'brackets.io',
  },
  {
    name: 'ColdFusion Builder',
    registryKeys: [
      // 64-bit version of ColdFusionBuilder3
      LocalMachineUninstallKey('Adobe ColdFusion Builder 3_is1'),
      // 64-bit version of ColdFusionBuilder2016
      LocalMachineUninstallKey('Adobe ColdFusion Builder 2016'),
    ],
    executableShimPaths: [['CFBuilder.exe']],
    displayNamePrefix: 'Adobe ColdFusion Builder',
    publisher: 'Adobe Systems Incorporated',
  },
  {
    name: 'Typora',
    registryKeys: [
      // 64-bit version of Typora
      LocalMachineUninstallKey('{37771A20-7167-44C0-B322-FD3E54C56156}_is1'),
      // 32-bit version of Typora
      Wow64LocalMachineUninstallKey(
        '{37771A20-7167-44C0-B322-FD3E54C56156}_is1'
      ),
    ],
    executableShimPaths: [['typora.exe']],
    displayNamePrefix: 'Typora',
    publisher: 'typora.io',
  },
  {
    name: 'SlickEdit',
    registryKeys: [
      // 64-bit version of SlickEdit Pro 2018
      LocalMachineUninstallKey('{18406187-F49E-4822-CAF2-1D25C0C83BA2}'),
      // 32-bit version of SlickEdit Pro 2018
      Wow64LocalMachineUninstallKey('{18006187-F49E-4822-CAF2-1D25C0C83BA2}'),
      // 64-bit version of SlickEdit Standard 2018
      LocalMachineUninstallKey('{18606187-F49E-4822-CAF2-1D25C0C83BA2}'),
      // 32-bit version of SlickEdit Standard 2018
      Wow64LocalMachineUninstallKey('{18206187-F49E-4822-CAF2-1D25C0C83BA2}'),
      // 64-bit version of SlickEdit Pro 2017
      LocalMachineUninstallKey('{15406187-F49E-4822-CAF2-1D25C0C83BA2}'),
      // 32-bit version of SlickEdit Pro 2017
      Wow64LocalMachineUninstallKey('{15006187-F49E-4822-CAF2-1D25C0C83BA2}'),
      // 64-bit version of SlickEdit Pro 2016 (21.0.1)
      LocalMachineUninstallKey('{10C06187-F49E-4822-CAF2-1D25C0C83BA2}'),
      // 64-bit version of SlickEdit Pro 2016 (21.0.0)
      LocalMachineUninstallKey('{10406187-F49E-4822-CAF2-1D25C0C83BA2}'),
      // 64-bit version of SlickEdit Pro 2015 (20.0.3)
      LocalMachineUninstallKey('{0DC06187-F49E-4822-CAF2-1D25C0C83BA2}'),
      // 64-bit version of SlickEdit Pro 2015 (20.0.2)
      LocalMachineUninstallKey('{0D406187-F49E-4822-CAF2-1D25C0C83BA2}'),
      // 64-bit version of SlickEdit Pro 2014 (19.0.2)
      LocalMachineUninstallKey('{7CC0E567-ACD6-41E8-95DA-154CEEDB0A18}'),
    ],
    executableShimPaths: [['win', 'vs.exe']],
    displayNamePrefix: 'SlickEdit',
    publisher: 'SlickEdit Inc.',
  },
  {
    name: 'JetBrains Webstorm',
    registryKeys: registryKeysForJetBrainsIDE('WebStorm'),
    executableShimPaths: executableShimPathsForJetBrainsIDE('webstorm'),
    displayNamePrefix: 'WebStorm',
    publisher: 'JetBrains s.r.o.',
  },
  {
    name: 'JetBrains Phpstorm',
    registryKeys: registryKeysForJetBrainsIDE('PhpStorm'),
    executableShimPaths: executableShimPathsForJetBrainsIDE('phpstorm'),
    displayNamePrefix: 'PhpStorm',
    publisher: 'JetBrains s.r.o.',
  },
  {
    name: 'Android Studio',
    registryKeys: [LocalMachineUninstallKey('Android Studio')],
    installLocationRegistryKey: 'UninstallString',
    executableShimPaths: [
      ['..', 'bin', `studio64.exe`],
      ['..', 'bin', `studio.exe`],
    ],
    displayNamePrefix: 'Android Studio',
    publisher: 'Google LLC',
  },
  {
    name: 'Notepad++',
    registryKeys: [
      // 64-bit version of Notepad++
      LocalMachineUninstallKey('Notepad++'),
      // 32-bit version of Notepad++
      Wow64LocalMachineUninstallKey('Notepad++'),
    ],
    installLocationRegistryKey: 'DisplayIcon',
    displayNamePrefix: 'Notepad++',
    publisher: 'Notepad++ Team',
  },
  {
    name: 'JetBrains Rider',
    registryKeys: registryKeysForJetBrainsIDE('JetBrains Rider'),
    executableShimPaths: executableShimPathsForJetBrainsIDE('rider'),
    displayNamePrefix: 'JetBrains Rider',
    publisher: 'JetBrains s.r.o.',
  },
  {
    name: 'RStudio',
    registryKeys: [Wow64LocalMachineUninstallKey('RStudio')],
    installLocationRegistryKey: 'DisplayIcon',
    displayNamePrefix: 'RStudio',
    publisher: 'RStudio',
  },
  {
    name: 'JetBrains IntelliJ Idea',
    registryKeys: registryKeysForJetBrainsIDE('IntelliJ IDEA'),
    executableShimPaths: executableShimPathsForJetBrainsIDE('idea'),
    displayNamePrefix: 'IntelliJ IDEA ',
    publisher: 'JetBrains s.r.o.',
  },
  {
    name: 'JetBrains IntelliJ Idea Community Edition',
    registryKeys: registryKeysForJetBrainsIDE(
      'IntelliJ IDEA Community Edition'
    ),
    executableShimPaths: executableShimPathsForJetBrainsIDE('idea'),
    displayNamePrefix: 'IntelliJ IDEA Community Edition ',
    publisher: 'JetBrains s.r.o.',
  },
  {
    name: 'JetBrains PyCharm',
    registryKeys: registryKeysForJetBrainsIDE('PyCharm'),
    executableShimPaths: executableShimPathsForJetBrainsIDE('pycharm'),
    displayNamePrefix: 'PyCharm ',
    publisher: 'JetBrains s.r.o.',
  },
  {
    name: 'JetBrains PyCharm Community Edition',
    registryKeys: registryKeysForJetBrainsIDE('PyCharm Community Edition'),
    executableShimPaths: executableShimPathsForJetBrainsIDE('pycharm'),
    displayNamePrefix: 'PyCharm Community Edition',
    publisher: 'JetBrains s.r.o.',
  },
  {
    name: 'JetBrains CLion',
    registryKeys: registryKeysForJetBrainsIDE('CLion'),
    executableShimPaths: executableShimPathsForJetBrainsIDE('clion'),
    displayNamePrefix: 'CLion ',
    publisher: 'JetBrains s.r.o.',
  },
  {
    name: 'JetBrains RubyMine',
    registryKeys: registryKeysForJetBrainsIDE('RubyMine'),
    executableShimPaths: executableShimPathsForJetBrainsIDE('rubymine'),
    displayNamePrefix: 'RubyMine ',
    publisher: 'JetBrains s.r.o.',
  },
  {
    name: 'JetBrains GoLand',
    registryKeys: registryKeysForJetBrainsIDE('GoLand'),
    executableShimPaths: executableShimPathsForJetBrainsIDE('goland'),
    displayNamePrefix: 'GoLand ',
    publisher: 'JetBrains s.r.o.',
  },
]

function getKeyOrEmpty(
  keys: ReadonlyArray<RegistryValue>,
  key: string
): string {
  const entry = keys.find(k => k.name === key)
  return entry && entry.type === RegistryValueType.REG_SZ ? entry.data : ''
}

function getAppInfo(
  editor: WindowsExternalEditor,
  keys: ReadonlyArray<RegistryValue>
): IWindowsAppInformation {
  const displayName = getKeyOrEmpty(keys, 'DisplayName')
  const publisher = getKeyOrEmpty(keys, 'Publisher')
  const installLocation = getKeyOrEmpty(
    keys,
    editor.installLocationRegistryKey ?? 'InstallLocation'
  ).replace(/(^"|"$)/g, '') // remove leading and trailing quotes
  return { displayName, publisher, installLocation }
}

async function findApplication(editor: WindowsExternalEditor) {
  for (const { key, subKey } of editor.registryKeys) {

    const keys = enumerateValues(key, subKey)
    if (keys.length === 0) {
      continue
    }

    const { displayName, publisher, installLocation } = getAppInfo(editor, keys)

    if (
      !displayName.startsWith(editor.displayNamePrefix) ||
      publisher !== editor.publisher
    ) {
      log.debug(`Unexpected registry entries for ${editor.name}`)
      continue
    }

    const executableShimPaths =
      editor.installLocationRegistryKey === 'DisplayIcon'
        ? [installLocation]
        : editor.executableShimPaths.map(p => Path.join(installLocation, ...p))

    for (const path of executableShimPaths) {
      const exists = await pathExists(path)
      if (exists) {
        return path
      }

      log.debug(`Executable for ${editor.name} not found at '${path}'`)
    }
  }

  return null
}

/**
 * Lookup known external editors using the Windows registry to find installed
 * applications and their location on disk for Desktop to launch.
 */
export async function getAvailableEditors(): Promise<
  ReadonlyArray<IFoundEditor<string>>
> {
  const results: Array<IFoundEditor<string>> = []

  for (const editor of editors) {
    const path = await findApplication(editor)
    if (path) {
      results.push({
        editor: editor.name,
        path,
        usesShell: path.endsWith('.cmd'),
      })
    }
  }

  const vswherePath = await getPathToVsWhere(visualStudioInstaller);
  if (vswherePath!==null) {
    for (const editor of visualStudioEditors) {
      const output = await execFile(vswherePath, ['-version', editor.version, '-products', editor.productId, '-property', 'productPath'] );
      const path = output.stdout.trim();
      const exists = await pathExists(path);
      if (exists) {
        results.push({
          editor: editor.name,
          path,
          usesShell: false,
        })
      }
    }
  } 

  return results
}
