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

type AppInformationExtractor = (
  keys: ReadonlyArray<RegistryValue>
) => IWindowsAppInformation

type ExpectedInstallationChecker = (
  displayName: string,
  publisher: string
) => boolean

interface IWindowsExternalEditor {
  readonly name: string

  /**
   * Set of registry keys associated with the installed application.
   *
   * Some tools (like VSCode) may support a 64-bit or 32-bit version of the
   * tool - we should use whichever they have installed.
   */
  readonly registryKeys: ReadonlyArray<{ key: HKEY; subKey: string }>

  readonly executableShimPath: ReadonlyArray<string>

  readonly usesShell?: boolean

  /**
   * Function that maps the registry information to a list of known installer
   * fields.
   *
   * Receives the collection of registry key-value pairs for the app.
   */
  readonly appInformationExtractor?: AppInformationExtractor

  /**
   * Confirm the found installation matches the expected identifier details
   *
   * @param editor The external editor
   * @param displayName The display name as listed in the registry
   * @param publisher The publisher who created the installer
   */
  readonly expectedInstallationChecker: ExpectedInstallationChecker
}

const editors: IWindowsExternalEditor[] = [
  {
    name: 'Atom',
    registryKeys: [
      {
        key: HKEY.HKEY_CURRENT_USER,
        subKey: 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\atom',
      },
    ],
    executableShimPath: ['bin', 'atom.cmd'], // remember, CMD must 'usesShell'
    usesShell: true,
    expectedInstallationChecker: (displayName, publisher) =>
      displayName === 'Atom' && publisher === 'GitHub Inc.',
  },
  {
    name: 'Atom Beta',
    registryKeys: [
      {
        key: HKEY.HKEY_CURRENT_USER,
        subKey:
          'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\atom-beta',
      },
    ],
    executableShimPath: ['bin', 'atom-beta.cmd'], // remember, CMD must 'usesShell'
    usesShell: true,
    expectedInstallationChecker: (displayName, publisher) =>
      displayName === 'Atom Beta' && publisher === 'GitHub Inc.',
  },
  {
    name: 'Atom Nightly',
    registryKeys: [
      {
        key: HKEY.HKEY_CURRENT_USER,
        subKey:
          'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\atom-nightly',
      },
    ],
    executableShimPath: ['bin', 'atom-nightly.cmd'],
    usesShell: true,
    expectedInstallationChecker: (displayName, publisher) =>
      displayName === 'Atom Nightly' && publisher === 'GitHub Inc.',
  },
  {
    name: 'Visual Studio Code',
    registryKeys: [
      // 64-bit version of VSCode (user) - provided by default in 64-bit Windows
      {
        key: HKEY.HKEY_CURRENT_USER,
        subKey:
          'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{771FD6B0-FA20-440A-A002-3B3BAC16DC50}_is1',
      },
      // 32-bit version of VSCode (user)
      {
        key: HKEY.HKEY_CURRENT_USER,
        subKey:
          'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{D628A17A-9713-46BF-8D57-E671B46A741E}_is1',
      },
      // 64-bit version of VSCode (system) - was default before user scope installation
      {
        key: HKEY.HKEY_LOCAL_MACHINE,
        subKey:
          'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{EA457B21-F73E-494C-ACAB-524FDE069978}_is1',
      },
      // 32-bit version of VSCode (system)
      {
        key: HKEY.HKEY_LOCAL_MACHINE,
        subKey:
          'SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{F8A2A208-72B3-4D61-95FC-8A65D340689B}_is1',
      },
    ],
    executableShimPath: ['bin', 'code.cmd'],
    usesShell: true,
    expectedInstallationChecker: (displayName, publisher) =>
      displayName.startsWith('Microsoft Visual Studio Code') &&
      publisher === 'Microsoft Corporation',
  },
  {
    name: 'Visual Studio Code (Insiders)',
    registryKeys: [
      // 64-bit version of VSCode (user) - provided by default in 64-bit Windows
      {
        key: HKEY.HKEY_CURRENT_USER,
        subKey:
          'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{217B4C08-948D-4276-BFBB-BEE930AE5A2C}_is1',
      },
      // 32-bit version of VSCode (user)
      {
        key: HKEY.HKEY_CURRENT_USER,
        subKey:
          'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{26F4A15E-E392-4887-8C09-7BC55712FD5B}_is1',
      },
      // 64-bit version of VSCode (system) - was default before user scope installation
      {
        key: HKEY.HKEY_LOCAL_MACHINE,
        subKey:
          'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{1287CAD5-7C8D-410D-88B9-0D1EE4A83FF2}_is1',
      },
      // 32-bit version of VSCode (system)
      {
        key: HKEY.HKEY_LOCAL_MACHINE,
        subKey:
          'SOFTWARE\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{C26E74D1-022E-4238-8B9D-1E7564A36CC9}_is1',
      },
    ],
    executableShimPath: ['bin', 'code-insiders.cmd'],
    usesShell: true,
    expectedInstallationChecker: (displayName, publisher) =>
      displayName.startsWith('Microsoft Visual Studio Code Insiders') &&
      publisher === 'Microsoft Corporation',
  },
  {
    name: 'Visual Studio Codium',
    registryKeys: [
      // 64-bit version of VSCodium (user)
      {
        key: HKEY.HKEY_CURRENT_USER,
        subKey:
          'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{2E1F05D1-C245-4562-81EE-28188DB6FD17}_is1',
      },
      // 32-bit version of VSCodium (user)
      {
        key: HKEY.HKEY_CURRENT_USER,
        subKey:
          'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{C6065F05-9603-4FC4-8101-B9781A25D88E}}_is1',
      },
      // 64-bit version of VSCodium (system)
      {
        key: HKEY.HKEY_LOCAL_MACHINE,
        subKey:
          'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{D77B7E06-80BA-4137-BCF4-654B95CCEBC5}_is1',
      },
      // 32-bit version of VSCodium (system)
      {
        key: HKEY.HKEY_LOCAL_MACHINE,
        subKey:
          'SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{E34003BB-9E10-4501-8C11-BE3FAA83F23F}_is1',
      },
    ],
    executableShimPath: ['bin', 'codium.cmd'],
    usesShell: true,
    expectedInstallationChecker: (displayName, publisher) =>
      displayName.startsWith('VSCodium') &&
      publisher === 'Microsoft Corporation',
  },
  {
    name: 'Sublime Text',
    registryKeys: [
      {
        key: HKEY.HKEY_LOCAL_MACHINE,
        subKey:
          'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Sublime Text 3_is1',
      },
    ],
    executableShimPath: ['subl.exe'],
    appInformationExtractor: keys => {
      let displayName = ''
      let publisher = ''
      let installLocation = ''

      for (const item of keys) {
        // NOTE:
        // Sublime Text appends the build number to the DisplayName value, so for
        // forward-compatibility let's do a simple check for the identifier
        if (
          item.name === 'DisplayName' &&
          item.type === RegistryValueType.REG_SZ &&
          item.data.startsWith('Sublime Text')
        ) {
          displayName = 'Sublime Text'
        } else if (
          item.name === 'Publisher' &&
          item.type === RegistryValueType.REG_SZ
        ) {
          publisher = item.data
        } else if (
          item.name === 'InstallLocation' &&
          item.type === RegistryValueType.REG_SZ
        ) {
          installLocation = item.data
        }
      }

      return { displayName, publisher, installLocation }
    },
    expectedInstallationChecker: (displayName, publisher) =>
      displayName === 'Sublime Text' && publisher === 'Sublime HQ Pty Ltd',
  },
  {
    name: 'ColdFusion Builder',
    registryKeys: [
      // 64-bit version of ColdFusionBuilder3
      {
        key: HKEY.HKEY_LOCAL_MACHINE,
        subKey:
          'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Adobe ColdFusion Builder 3_is1',
      },
      // 64-bit version of ColdFusionBuilder2016
      {
        key: HKEY.HKEY_LOCAL_MACHINE,
        subKey:
          'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Adobe ColdFusion Builder 2016',
      },
    ],
    executableShimPath: ['CFBuilder.exe'],
    expectedInstallationChecker: (displayName, publisher) =>
      (displayName === 'Adobe ColdFusion Builder 3' ||
        displayName === 'Adobe ColdFusion Builder 2016') &&
      publisher === 'Adobe Systems Incorporated',
  },
  {
    name: 'Typora',
    registryKeys: [
      // 64-bit version of Typora
      {
        key: HKEY.HKEY_LOCAL_MACHINE,
        subKey:
          'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{37771A20-7167-44C0-B322-FD3E54C56156}_is1',
      },
      // 32-bit version of Typora
      {
        key: HKEY.HKEY_LOCAL_MACHINE,
        subKey:
          'SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{37771A20-7167-44C0-B322-FD3E54C56156}_is1',
      },
    ],
    executableShimPath: ['typora.exe'],
    expectedInstallationChecker: (displayName, publisher) =>
      displayName.startsWith('Typora') && publisher === 'typora.io',
  },
  {
    name: 'SlickEdit',
    registryKeys: [
      // 64-bit version of SlickEdit Pro 2018
      {
        key: HKEY.HKEY_LOCAL_MACHINE,
        subKey:
          'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{18406187-F49E-4822-CAF2-1D25C0C83BA2}',
      },
      // 32-bit version of SlickEdit Pro 2018
      {
        key: HKEY.HKEY_LOCAL_MACHINE,
        subKey:
          'SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{18006187-F49E-4822-CAF2-1D25C0C83BA2}',
      },
      // 64-bit version of SlickEdit Standard 2018
      {
        key: HKEY.HKEY_LOCAL_MACHINE,
        subKey:
          'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{18606187-F49E-4822-CAF2-1D25C0C83BA2}',
      },
      // 32-bit version of SlickEdit Standard 2018
      {
        key: HKEY.HKEY_LOCAL_MACHINE,
        subKey:
          'SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{18206187-F49E-4822-CAF2-1D25C0C83BA2}',
      },
      // 64-bit version of SlickEdit Pro 2017
      {
        key: HKEY.HKEY_LOCAL_MACHINE,
        subKey:
          'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{15406187-F49E-4822-CAF2-1D25C0C83BA2}',
      },
      // 32-bit version of SlickEdit Pro 2017
      {
        key: HKEY.HKEY_LOCAL_MACHINE,
        subKey:
          'SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{15006187-F49E-4822-CAF2-1D25C0C83BA2}',
      },
      // 64-bit version of SlickEdit Pro 2016 (21.0.1)
      {
        key: HKEY.HKEY_LOCAL_MACHINE,
        subKey:
          'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{10C06187-F49E-4822-CAF2-1D25C0C83BA2}',
      },
      // 64-bit version of SlickEdit Pro 2016 (21.0.0)
      {
        key: HKEY.HKEY_LOCAL_MACHINE,
        subKey:
          'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{10406187-F49E-4822-CAF2-1D25C0C83BA2}',
      },
      // 64-bit version of SlickEdit Pro 2015 (20.0.3)
      {
        key: HKEY.HKEY_LOCAL_MACHINE,
        subKey:
          'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{0DC06187-F49E-4822-CAF2-1D25C0C83BA2}',
      },
      // 64-bit version of SlickEdit Pro 2015 (20.0.2)
      {
        key: HKEY.HKEY_LOCAL_MACHINE,
        subKey:
          'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{0D406187-F49E-4822-CAF2-1D25C0C83BA2}',
      },
      // 64-bit version of SlickEdit Pro 2014 (19.0.2)
      {
        key: HKEY.HKEY_LOCAL_MACHINE,
        subKey:
          'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{7CC0E567-ACD6-41E8-95DA-154CEEDB0A18}',
      },
    ],
    executableShimPath: ['win', 'vs.exe'],
    expectedInstallationChecker: (displayName, publisher) =>
      displayName.startsWith('SlickEdit') && publisher === 'SlickEdit Inc.',
  },
  {
    name: 'JetBrains Webstorm',
    registryKeys: [
      // Webstorm 2018.3
      {
        key: HKEY.HKEY_LOCAL_MACHINE,
        subKey:
          'SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\WebStorm 2018.3',
      },
      // Webstorm 2019.2
      {
        key: HKEY.HKEY_LOCAL_MACHINE,
        subKey:
          'SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\WebStorm 2019.2',
      },
      // Webstorm 2019.2.4
      {
        key: HKEY.HKEY_LOCAL_MACHINE,
        subKey:
          'SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\WebStorm 2019.2.4',
      },
      // Webstorm 2019.3
      {
        key: HKEY.HKEY_LOCAL_MACHINE,
        subKey:
          'SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\WebStorm 2019.3',
      },
      // Webstorm 2020.1
      {
        key: HKEY.HKEY_LOCAL_MACHINE,
        subKey:
          'SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\WebStorm 2020.1',
      },
    ],
    executableShimPath: ['bin', 'webstorm.exe'],
    appInformationExtractor: keys => {
      let displayName = ''
      let publisher = ''
      let installLocation = ''

      for (const item of keys) {
        // NOTE:
        // Webstorm adds the current release number to the end of the Display Name, below checks for "WebStorm"
        if (
          item.name === 'DisplayName' &&
          item.type === RegistryValueType.REG_SZ &&
          item.data.startsWith('WebStorm ')
        ) {
          displayName = 'WebStorm'
        } else if (
          item.name === 'Publisher' &&
          item.type === RegistryValueType.REG_SZ
        ) {
          publisher = item.data
        } else if (
          item.name === 'InstallLocation' &&
          item.type === RegistryValueType.REG_SZ
        ) {
          installLocation = item.data
        }
      }

      return { displayName, publisher, installLocation }
    },
    expectedInstallationChecker: (displayName, publisher) =>
      displayName.startsWith('WebStorm') && publisher === 'JetBrains s.r.o.',
  },
  {
    name: 'JetBrains Phpstorm',
    registryKeys: [
      // PhpStorm 2019.2
      {
        key: HKEY.HKEY_LOCAL_MACHINE,
        subKey:
          'SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\PhpStorm 2019.2',
      },
      // PhpStorm 2019.2.4
      {
        key: HKEY.HKEY_LOCAL_MACHINE,
        subKey:
          'SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\PhpStorm 2019.2.4',
      },
      // PhpStorm 2019.3
      {
        key: HKEY.HKEY_LOCAL_MACHINE,
        subKey:
          'SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\PhpStorm 2019.3',
      },
      // PhpStorm 2020.1
      {
        key: HKEY.HKEY_LOCAL_MACHINE,
        subKey:
          'SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\PhpStorm 2020.1',
      },
    ],
    executableShimPath: ['bin', 'phpstorm.exe'],
    appInformationExtractor: keys => {
      let displayName = ''
      let publisher = ''
      let installLocation = ''

      for (const item of keys) {
        // NOTE:
        // Webstorm adds the current release number to the end of the Display Name, below checks for "PhpStorm"
        if (
          item.name === 'DisplayName' &&
          item.type === RegistryValueType.REG_SZ &&
          item.data.startsWith('PhpStorm ')
        ) {
          displayName = 'PhpStorm'
        } else if (
          item.name === 'Publisher' &&
          item.type === RegistryValueType.REG_SZ
        ) {
          publisher = item.data
        } else if (
          item.name === 'InstallLocation' &&
          item.type === RegistryValueType.REG_SZ
        ) {
          installLocation = item.data
        }
      }

      return { displayName, publisher, installLocation }
    },
    expectedInstallationChecker: (displayName, publisher) =>
      displayName.startsWith('PhpStorm') && publisher === 'JetBrains s.r.o.',
  },
  {
    name: 'Notepad++',
    registryKeys: [
      // 64-bit version of Notepad++
      {
        key: HKEY.HKEY_LOCAL_MACHINE,
        subKey:
          'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Notepad++',
      },
      // 32-bit version of Notepad++
      {
        key: HKEY.HKEY_LOCAL_MACHINE,
        subKey:
          'SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Notepad++',
      },
    ],
    executableShimPath: [],
    appInformationExtractor: keys => {
      const displayName = getKeyOrEmpty(keys, 'DisplayName')
      const publisher = getKeyOrEmpty(keys, 'Publisher')
      const installLocation = getKeyOrEmpty(keys, 'DisplayIcon')

      return { displayName, publisher, installLocation }
    },
    expectedInstallationChecker: (displayName, publisher) =>
      displayName.startsWith('Notepad++') && publisher === 'Notepad++ Team',
  },
  {
    name: 'JetBrains Rider',
    registryKeys: [
      // Rider 2019.3.4
      {
        key: HKEY.HKEY_LOCAL_MACHINE,
        subKey:
          'SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\JetBrains Rider 2019.3.4',
      },
    ],
    executableShimPath: ['bin', 'rider64.exe'],
    appInformationExtractor: keys => {
      let displayName = ''
      let publisher = ''
      let installLocation = ''

      for (const item of keys) {
        // NOTE:
        // JetBrains Rider adds the current release number to the end of the Display Name, below checks for "JetBrains Rider"
        if (
          item.name === 'DisplayName' &&
          item.type === RegistryValueType.REG_SZ &&
          item.data.startsWith('JetBrains Rider ')
        ) {
          displayName = 'JetBrains Rider'
        } else if (
          item.name === 'Publisher' &&
          item.type === RegistryValueType.REG_SZ
        ) {
          publisher = item.data
        } else if (
          item.name === 'InstallLocation' &&
          item.type === RegistryValueType.REG_SZ
        ) {
          installLocation = item.data
        }
      }

      return { displayName, publisher, installLocation }
    },
    expectedInstallationChecker: (displayName, publisher) =>
      displayName.startsWith('JetBrains Rider') &&
      publisher === 'JetBrains s.r.o.',
  },
]

function getKeyOrEmpty(
  keys: ReadonlyArray<RegistryValue>,
  key: string
): string {
  const entry = keys.find(k => k.name === key)
  return entry && entry.type === RegistryValueType.REG_SZ ? entry.data : ''
}

const defaultAppInformationExtractor: AppInformationExtractor = keys => {
  const displayName = getKeyOrEmpty(keys, 'DisplayName')
  const publisher = getKeyOrEmpty(keys, 'Publisher')
  const installLocation = getKeyOrEmpty(keys, 'InstallLocation')
  return { displayName, publisher, installLocation }
}

async function findApplication(
  editor: IWindowsExternalEditor
): Promise<string | null> {
  let keys: ReadonlyArray<RegistryValue> = []
  for (const { key, subKey } of editor.registryKeys) {
    keys = enumerateValues(key, subKey)
    if (keys.length > 0) {
      break
    }
  }

  if (keys.length === 0) {
    return null
  }

  const appInformationExtractor =
    editor.appInformationExtractor ?? defaultAppInformationExtractor

  const { displayName, publisher, installLocation } = appInformationExtractor(
    keys
  )

  if (!editor.expectedInstallationChecker(displayName, publisher)) {
    log.debug(
      `Registry entry for ${editor.name} did not match expected publisher settings`
    )
    return null
  }

  const path = Path.join(installLocation, ...editor.executableShimPath)
  const exists = await pathExists(path)
  if (!exists) {
    log.debug(
      `Command line interface for ${editor.name} not found at '${path}'`
    )
    return null
  }

  return path
}

/**
 * Lookup known external editors using the Windows registry to find installed
 * applications and their location on disk for Desktop to launch.
 */
export async function getAvailableEditors(): Promise<
  ReadonlyArray<IFoundEditor<string>>
> {
  const results: Array<IFoundEditor<string>> = []

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
        usesShell: editor.usesShell ?? false,
      })
    }
  }

  return results
}
