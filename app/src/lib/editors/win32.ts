import * as Path from 'path'

import {
  enumerateValues,
  HKEY,
  RegistryValue,
  RegistryValueType,
} from 'registry-js'

import { pathExists } from 'fs-extra'
import { IFoundEditor } from './found-editor'

interface IWindowsAppInformation {
  displayName: string
  publisher: string
  installLocation: string
}

type ExpectedInstallationChecker = (
  displayName: string,
  publisher: string
) => boolean

/** Represents an external editor on Windows */
interface IWindowsExternalEditor {
  /** Name of the editor. It will be used both as identifier and user-facing. */
  readonly name: string

  /**
   * Set of registry keys associated with the installed application.
   *
   * Some tools (like VSCode) may support a 64-bit or 32-bit version of the
   * tool - we should use whichever they have installed.
   */
  readonly registryKeys: ReadonlyArray<{ key: HKEY; subKey: string }>

  /**
   * List of path components from the editor's installation folder to the
   * executable shim.
   **/
  readonly executableShimPath: ReadonlyArray<string>

  /**
   * Registry key with the install location of the app. If not provided,
   * 'InstallLocation' will be used.
   **/
  readonly installLocationRegistryKey?: string

  /**
   * Function to check if the found installation matches the expected identifier
   * details.
   *
   * @param displayName The display name as listed in the registry
   * @param publisher The publisher who created the installer
   */
  readonly expectedInstallationChecker: ExpectedInstallationChecker
}

const registryKey = (key: HKEY, ...subKeys: string[]) => ({
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

/**
 * This list contains all the external editors supported on Windows. Add a new
 * entry here to add support for your favorite editor.
 **/
const editors: IWindowsExternalEditor[] = [
  {
    name: 'Atom',
    registryKeys: [CurrentUserUninstallKey('atom')],
    executableShimPath: ['bin', 'atom.cmd'],
    expectedInstallationChecker: (displayName, publisher) =>
      displayName === 'Atom' && publisher === 'GitHub Inc.',
  },
  {
    name: 'Atom Beta',
    registryKeys: [CurrentUserUninstallKey('atom-beta')],
    executableShimPath: ['bin', 'atom-beta.cmd'],
    expectedInstallationChecker: (displayName, publisher) =>
      displayName === 'Atom Beta' && publisher === 'GitHub Inc.',
  },
  {
    name: 'Atom Nightly',
    registryKeys: [CurrentUserUninstallKey('atom-nightly')],
    executableShimPath: ['bin', 'atom-nightly.cmd'],
    expectedInstallationChecker: (displayName, publisher) =>
      displayName === 'Atom Nightly' && publisher === 'GitHub Inc.',
  },
  {
    name: 'Visual Studio Code',
    registryKeys: [
      // 64-bit version of VSCode (user) - provided by default in 64-bit Windows
      CurrentUserUninstallKey('{771FD6B0-FA20-440A-A002-3B3BAC16DC50}_is1'),
      // 32-bit version of VSCode (user)
      CurrentUserUninstallKey('{D628A17A-9713-46BF-8D57-E671B46A741E}_is1'),
      // 64-bit version of VSCode (system) - was default before user scope installation
      LocalMachineUninstallKey('{EA457B21-F73E-494C-ACAB-524FDE069978}_is1'),
      // 32-bit version of VSCode (system)
      Wow64LocalMachineUninstallKey(
        '{F8A2A208-72B3-4D61-95FC-8A65D340689B}_is1'
      ),
    ],
    executableShimPath: ['bin', 'code.cmd'],
    expectedInstallationChecker: (displayName, publisher) =>
      displayName.startsWith('Microsoft Visual Studio Code') &&
      publisher === 'Microsoft Corporation',
  },
  {
    name: 'Visual Studio Code (Insiders)',
    registryKeys: [
      // 64-bit version of VSCode (user) - provided by default in 64-bit Windows
      CurrentUserUninstallKey('{217B4C08-948D-4276-BFBB-BEE930AE5A2C}_is1'),
      // 32-bit version of VSCode (user)
      CurrentUserUninstallKey('{26F4A15E-E392-4887-8C09-7BC55712FD5B}_is1'),
      // 64-bit version of VSCode (system) - was default before user scope installation
      LocalMachineUninstallKey('{1287CAD5-7C8D-410D-88B9-0D1EE4A83FF2}_is1'),
      // 32-bit version of VSCode (system)
      Wow64LocalMachineUninstallKey(
        '{C26E74D1-022E-4238-8B9D-1E7564A36CC9}_is1'
      ),
    ],
    executableShimPath: ['bin', 'code-insiders.cmd'],
    expectedInstallationChecker: (displayName, publisher) =>
      displayName.startsWith('Microsoft Visual Studio Code Insiders') &&
      publisher === 'Microsoft Corporation',
  },
  {
    name: 'Visual Studio Codium',
    registryKeys: [
      // 64-bit version of VSCodium (user)
      CurrentUserUninstallKey('{2E1F05D1-C245-4562-81EE-28188DB6FD17}_is1'),
      // 32-bit version of VSCodium (user)
      CurrentUserUninstallKey('{C6065F05-9603-4FC4-8101-B9781A25D88E}}_is1'),
      // 64-bit version of VSCodium (system)
      LocalMachineUninstallKey('{D77B7E06-80BA-4137-BCF4-654B95CCEBC5}_is1'),
      // 32-bit version of VSCodium (system)
      Wow64LocalMachineUninstallKey(
        '{E34003BB-9E10-4501-8C11-BE3FAA83F23F}_is1'
      ),
    ],
    executableShimPath: ['bin', 'codium.cmd'],
    expectedInstallationChecker: (displayName, publisher) =>
      displayName.startsWith('VSCodium') &&
      publisher === 'Microsoft Corporation',
  },
  {
    name: 'Sublime Text',
    registryKeys: [LocalMachineUninstallKey('Sublime Text 3_is1')],
    executableShimPath: ['subl.exe'],
    expectedInstallationChecker: (displayName, publisher) =>
      displayName.startsWith('Sublime Text') &&
      publisher === 'Sublime HQ Pty Ltd',
  },
  {
    name: 'ColdFusion Builder',
    registryKeys: [
      // 64-bit version of ColdFusionBuilder3
      LocalMachineUninstallKey('Adobe ColdFusion Builder 3_is1'),
      // 64-bit version of ColdFusionBuilder2016
      LocalMachineUninstallKey('Adobe ColdFusion Builder 2016'),
    ],
    executableShimPath: ['CFBuilder.exe'],
    expectedInstallationChecker: (displayName, publisher) =>
      displayName.startsWith('Adobe ColdFusion Builder') &&
      publisher === 'Adobe Systems Incorporated',
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
    executableShimPath: ['typora.exe'],
    expectedInstallationChecker: (displayName, publisher) =>
      displayName.startsWith('Typora') && publisher === 'typora.io',
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
    executableShimPath: ['win', 'vs.exe'],
    expectedInstallationChecker: (displayName, publisher) =>
      displayName.startsWith('SlickEdit') && publisher === 'SlickEdit Inc.',
  },
  {
    name: 'JetBrains Webstorm',
    registryKeys: [
      Wow64LocalMachineUninstallKey('WebStorm 2018.3'),
      Wow64LocalMachineUninstallKey('WebStorm 2019.2'),
      Wow64LocalMachineUninstallKey('WebStorm 2019.2.4'),
      Wow64LocalMachineUninstallKey('WebStorm 2019.3'),
      Wow64LocalMachineUninstallKey('WebStorm 2020.1'),
    ],
    executableShimPath: ['bin', 'webstorm.exe'],
    expectedInstallationChecker: (displayName, publisher) =>
      displayName.startsWith('WebStorm') && publisher === 'JetBrains s.r.o.',
  },
  {
    name: 'JetBrains Phpstorm',
    registryKeys: [
      Wow64LocalMachineUninstallKey('PhpStorm 2019.2'),
      Wow64LocalMachineUninstallKey('PhpStorm 2019.2.4'),
      Wow64LocalMachineUninstallKey('PhpStorm 2019.3'),
      Wow64LocalMachineUninstallKey('PhpStorm 2020.1'),
    ],
    executableShimPath: ['bin', 'phpstorm.exe'],
    expectedInstallationChecker: (displayName, publisher) =>
      displayName.startsWith('PhpStorm') && publisher === 'JetBrains s.r.o.',
  },
  {
    name: 'Notepad++',
    registryKeys: [
      // 64-bit version of Notepad++
      LocalMachineUninstallKey('Notepad++'),
      // 32-bit version of Notepad++
      Wow64LocalMachineUninstallKey('Notepad++'),
    ],
    executableShimPath: [],
    installLocationRegistryKey: 'DisplayIcon',
    expectedInstallationChecker: (displayName, publisher) =>
      displayName.startsWith('Notepad++') && publisher === 'Notepad++ Team',
  },
  {
    name: 'JetBrains Rider',
    registryKeys: [Wow64LocalMachineUninstallKey('JetBrains Rider 2019.3.4')],
    executableShimPath: ['bin', 'rider64.exe'],
    expectedInstallationChecker: (displayName, publisher) =>
      displayName.startsWith('JetBrains Rider') &&
      publisher === 'JetBrains s.r.o.',
  },
  {
    name: 'RStudio',
    registryKeys: [Wow64LocalMachineUninstallKey('RStudio')],
    executableShimPath: [],
    installLocationRegistryKey: 'DisplayIcon',
    expectedInstallationChecker: (displayName, publisher) =>
      displayName === 'RStudio' && publisher === 'RStudio',
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
  editor: IWindowsExternalEditor,
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

async function findApplication(editor: IWindowsExternalEditor) {
  for (const { key, subKey } of editor.registryKeys) {
    const keys = enumerateValues(key, subKey)
    if (keys.length === 0) {
      continue
    }

    const { displayName, publisher, installLocation } = getAppInfo(editor, keys)

    if (!editor.expectedInstallationChecker(displayName, publisher)) {
      log.debug(`Unexpected registry entries for ${editor.name}`)
      continue
    }

    const path = Path.join(installLocation, ...editor.executableShimPath)
    const exists = await pathExists(path)
    if (!exists) {
      log.debug(`Executable for ${editor.name} not found at '${path}'`)
      continue
    }

    return path
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
