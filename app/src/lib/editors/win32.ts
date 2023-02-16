import * as Path from 'path'

import {
  enumerateValues,
  HKEY,
  RegistryValue,
  RegistryValueType,
} from 'registry-js'
import { pathExists } from '../../ui/lib/path-exists'

import { IFoundEditor } from './found-editor'

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
  /** Name of the editor. It will be used both as identifier and user-facing. */
  readonly name: string

  /**
   * Set of registry keys associated with the installed application.
   *
   * Some tools (like VSCode) may support a 64-bit or 32-bit version of the
   * tool - we should use whichever they have installed.
   */
  readonly registryKeys: ReadonlyArray<RegistryKey>

  /** Prefix of the DisplayName registry key that belongs to this editor. */
  readonly displayNamePrefix: string

  /** Value of the Publisher registry key that belongs to this editor. */
  readonly publishers: string[]

  /**
   * Default shell script name for JetBrains Product
   * To get the script name go to:
   * JetBrains Toolbox > Editor settings > Shell script name
   *
   * Go to `/docs/techical/editor-integration.md` for more information on
   * how to use this field.
   */
  readonly jetBrainsToolboxScriptName?: string
} & WindowsExternalEditorPathInfo

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
    publishers: ['GitHub Inc.'],
  },
  {
    name: 'Atom Beta',
    registryKeys: [CurrentUserUninstallKey('atom-beta')],
    executableShimPaths: [['bin', 'atom-beta.cmd']],
    displayNamePrefix: 'Atom Beta',
    publishers: ['GitHub Inc.'],
  },
  {
    name: 'Atom Nightly',
    registryKeys: [CurrentUserUninstallKey('atom-nightly')],
    executableShimPaths: [['bin', 'atom-nightly.cmd']],
    displayNamePrefix: 'Atom Nightly',
    publishers: ['GitHub Inc.'],
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
    publishers: ['Microsoft Corporation'],
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
    publishers: ['Microsoft Corporation'],
  },
  {
    name: 'Visual Studio Codium',
    registryKeys: [
      // 64-bit version of VSCodium (user)
      CurrentUserUninstallKey('{2E1F05D1-C245-4562-81EE-28188DB6FD17}_is1'),
      // 32-bit version of VSCodium (user) - new key
      CurrentUserUninstallKey('{0FD05EB4-651E-4E78-A062-515204B47A3A}_is1'),
      // ARM64 version of VSCodium (user) - new key
      CurrentUserUninstallKey('{57FD70A5-1B8D-4875-9F40-C5553F094828}_is1'),
      // 64-bit version of VSCodium (system) - new key
      LocalMachineUninstallKey('{88DA3577-054F-4CA1-8122-7D820494CFFB}_is1'),
      // 32-bit version of VSCodium (system) - new key
      Wow64LocalMachineUninstallKey(
        '{763CBF88-25C6-4B10-952F-326AE657F16B}_is1'
      ),
      // ARM64 version of VSCodium (system) - new key
      LocalMachineUninstallKey('{67DEE444-3D04-4258-B92A-BC1F0FF2CAE4}_is1'),
      // 32-bit version of VSCodium (user) - old key
      CurrentUserUninstallKey('{C6065F05-9603-4FC4-8101-B9781A25D88E}}_is1'),
      // ARM64 version of VSCodium (user) - old key
      CurrentUserUninstallKey('{3AEBF0C8-F733-4AD4-BADE-FDB816D53D7B}_is1'),
      // 64-bit version of VSCodium (system) - old key
      LocalMachineUninstallKey('{D77B7E06-80BA-4137-BCF4-654B95CCEBC5}_is1'),
      // 32-bit version of VSCodium (system) - old key
      Wow64LocalMachineUninstallKey(
        '{E34003BB-9E10-4501-8C11-BE3FAA83F23F}_is1'
      ),
      // ARM64 version of VSCodium (system) - old key
      LocalMachineUninstallKey('{D1ACE434-89C5-48D1-88D3-E2991DF85475}_is1'),
    ],
    executableShimPaths: [['bin', 'codium.cmd']],
    displayNamePrefix: 'VSCodium',
    publishers: ['VSCodium', 'Microsoft Corporation'],
  },
  {
    name: 'Visual Studio Codium (Insiders)',
    registryKeys: [
      // 64-bit version of VSCodium - Insiders (user)
      CurrentUserUninstallKey('{20F79D0D-A9AC-4220-9A81-CE675FFB6B41}_is1'),
      // 32-bit version of VSCodium - Insiders (user)
      CurrentUserUninstallKey('{ED2E5618-3E7E-4888-BF3C-A6CCC84F586F}_is1'),
      // ARM64 version of VSCodium - Insiders (user)
      CurrentUserUninstallKey('{2E362F92-14EA-455A-9ABD-3E656BBBFE71}_is1'),
      // 64-bit version of VSCodium - Insiders (system)
      LocalMachineUninstallKey('{B2E0DDB2-120E-4D34-9F7E-8C688FF839A2}_is1'),
      // 32-bit version of VSCodium - Insiders (system)
      Wow64LocalMachineUninstallKey(
        '{EF35BB36-FA7E-4BB9-B7DA-D1E09F2DA9C9}_is1'
      ),
      // ARM64 version of VSCodium - Insiders (system)
      LocalMachineUninstallKey('{44721278-64C6-4513-BC45-D48E07830599}_is1'),
    ],
    executableShimPaths: [['bin', 'codium-insiders.cmd']],
    displayNamePrefix: 'VSCodium (Insiders)',
    publishers: ['VSCodium'],
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
    publishers: ['Sublime HQ Pty Ltd'],
  },
  {
    name: 'Brackets',
    registryKeys: [
      Wow64LocalMachineUninstallKey('{4F3B6E8C-401B-4EDE-A423-6481C239D6FF}'),
    ],
    executableShimPaths: [['Brackets.exe']],
    displayNamePrefix: 'Brackets',
    publishers: ['brackets.io'],
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
    publishers: ['Adobe Systems Incorporated'],
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
    publishers: ['typora.io'],
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
    publishers: ['SlickEdit Inc.'],
  },
  {
    name: 'Aptana Studio 3',
    registryKeys: [
      Wow64LocalMachineUninstallKey('{2D6C1116-78C6-469C-9923-3E549218773F}'),
    ],
    executableShimPaths: [['AptanaStudio3.exe']],
    displayNamePrefix: 'Aptana Studio',
    publishers: ['Appcelerator'],
  },
  {
    name: 'JetBrains Webstorm',
    registryKeys: registryKeysForJetBrainsIDE('WebStorm'),
    executableShimPaths: executableShimPathsForJetBrainsIDE('webstorm'),
    jetBrainsToolboxScriptName: 'webstorm',
    displayNamePrefix: 'WebStorm',
    publishers: ['JetBrains s.r.o.'],
  },
  {
    name: 'JetBrains Phpstorm',
    registryKeys: registryKeysForJetBrainsIDE('PhpStorm'),
    executableShimPaths: executableShimPathsForJetBrainsIDE('phpstorm'),
    jetBrainsToolboxScriptName: 'phpstorm',
    displayNamePrefix: 'PhpStorm',
    publishers: ['JetBrains s.r.o.'],
  },
  {
    name: 'Android Studio',
    registryKeys: [LocalMachineUninstallKey('Android Studio')],
    installLocationRegistryKey: 'UninstallString',
    jetBrainsToolboxScriptName: 'studio',
    executableShimPaths: [
      ['..', 'bin', `studio64.exe`],
      ['..', 'bin', `studio.exe`],
    ],
    displayNamePrefix: 'Android Studio',
    publishers: ['Google LLC'],
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
    publishers: ['Notepad++ Team'],
  },
  {
    name: 'JetBrains Rider',
    registryKeys: registryKeysForJetBrainsIDE('JetBrains Rider'),
    executableShimPaths: executableShimPathsForJetBrainsIDE('rider'),
    jetBrainsToolboxScriptName: 'rider',
    displayNamePrefix: 'JetBrains Rider',
    publishers: ['JetBrains s.r.o.'],
  },
  {
    name: 'RStudio',
    registryKeys: [Wow64LocalMachineUninstallKey('RStudio')],
    installLocationRegistryKey: 'DisplayIcon',
    displayNamePrefix: 'RStudio',
    publishers: ['RStudio', 'Posit Software'],
  },
  {
    name: 'JetBrains IntelliJ Idea',
    registryKeys: registryKeysForJetBrainsIDE('IntelliJ IDEA'),
    executableShimPaths: executableShimPathsForJetBrainsIDE('idea'),
    jetBrainsToolboxScriptName: 'idea',
    displayNamePrefix: 'IntelliJ IDEA ',
    publishers: ['JetBrains s.r.o.'],
  },
  {
    name: 'JetBrains IntelliJ Idea Community Edition',
    registryKeys: registryKeysForJetBrainsIDE(
      'IntelliJ IDEA Community Edition'
    ),
    executableShimPaths: executableShimPathsForJetBrainsIDE('idea'),
    displayNamePrefix: 'IntelliJ IDEA Community Edition ',
    publishers: ['JetBrains s.r.o.'],
  },
  {
    name: 'JetBrains PyCharm',
    registryKeys: registryKeysForJetBrainsIDE('PyCharm'),
    executableShimPaths: executableShimPathsForJetBrainsIDE('pycharm'),
    jetBrainsToolboxScriptName: 'pycharm',
    displayNamePrefix: 'PyCharm ',
    publishers: ['JetBrains s.r.o.'],
  },
  {
    name: 'JetBrains PyCharm Community Edition',
    registryKeys: registryKeysForJetBrainsIDE('PyCharm Community Edition'),
    executableShimPaths: executableShimPathsForJetBrainsIDE('pycharm'),
    displayNamePrefix: 'PyCharm Community Edition',
    publishers: ['JetBrains s.r.o.'],
  },
  {
    name: 'JetBrains CLion',
    registryKeys: registryKeysForJetBrainsIDE('CLion'),
    executableShimPaths: executableShimPathsForJetBrainsIDE('clion'),
    jetBrainsToolboxScriptName: 'clion',
    displayNamePrefix: 'CLion ',
    publishers: ['JetBrains s.r.o.'],
  },
  {
    name: 'JetBrains RubyMine',
    registryKeys: registryKeysForJetBrainsIDE('RubyMine'),
    executableShimPaths: executableShimPathsForJetBrainsIDE('rubymine'),
    jetBrainsToolboxScriptName: 'rubymine',
    displayNamePrefix: 'RubyMine ',
    publishers: ['JetBrains s.r.o.'],
  },
  {
    name: 'JetBrains GoLand',
    registryKeys: registryKeysForJetBrainsIDE('GoLand'),
    executableShimPaths: executableShimPathsForJetBrainsIDE('goland'),
    jetBrainsToolboxScriptName: 'goland',
    displayNamePrefix: 'GoLand ',
    publishers: ['JetBrains s.r.o.'],
  },
  {
    name: 'JetBrains Fleet',
    registryKeys: [LocalMachineUninstallKey('Fleet')],
    jetBrainsToolboxScriptName: 'fleet',
    installLocationRegistryKey: 'DisplayIcon',
    displayNamePrefix: 'Fleet ',
    publishers: ['JetBrains s.r.o.'],
  },
  {
    name: 'JetBrains DataSpell',
    registryKeys: registryKeysForJetBrainsIDE('DataSpell'),
    executableShimPaths: executableShimPathsForJetBrainsIDE('dataspell'),
    jetBrainsToolboxScriptName: 'dataspell',
    displayNamePrefix: 'DataSpell ',
    publishers: ['JetBrains s.r.o.'],
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
  )
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
      !editor.publishers.includes(publisher)
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

  return findJetBrainsToolboxApplication(editor)
}

/**
 * Find JetBrain products installed through JetBrains Toolbox
 */
async function findJetBrainsToolboxApplication(editor: WindowsExternalEditor) {
  if (!editor.jetBrainsToolboxScriptName) {
    return null
  }

  const toolboxRegistryReference = [
    CurrentUserUninstallKey('toolbox'),
    Wow64LocalMachineUninstallKey('toolbox'),
  ]

  for (const { key, subKey } of toolboxRegistryReference) {
    const keys = enumerateValues(key, subKey)
    if (keys.length > 0) {
      const editorPathInToolbox = Path.join(
        getKeyOrEmpty(keys, 'UninstallString'),
        '..',
        '..',
        'scripts',
        `${editor.jetBrainsToolboxScriptName}.cmd`
      )
      const exists = await pathExists(editorPathInToolbox)
      if (exists) {
        return editorPathInToolbox
      }
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

  return results
}
