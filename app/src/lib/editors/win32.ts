import * as Path from 'path'

import {
  enumerateValues,
  HKEY,
  RegistryValue,
  RegistryValueType,
} from 'registry-js'

import { pathExists } from 'fs-extra'
import { IFoundEditor } from './found-editor'

import { assertNever } from '../fatal-error'

export enum ExternalEditor {
  Atom = 'Atom',
  VisualStudioCode = 'Visual Studio Code',
  VisualStudioCodeInsiders = 'Visual Studio Code (Insiders)',
  SublimeText = 'Sublime Text',
  CFBuilder = 'ColdFusion Builder',
  Typora = 'Typora',
  SlickEdit = 'Visual SlickEdit',
}

export function parse(label: string): ExternalEditor | null {
  if (label === ExternalEditor.Atom) {
    return ExternalEditor.Atom
  }
  if (label === ExternalEditor.VisualStudioCode) {
    return ExternalEditor.VisualStudioCode
  }
  if (label === ExternalEditor.VisualStudioCodeInsiders) {
    return ExternalEditor.VisualStudioCodeInsiders
  }
  if (label === ExternalEditor.SublimeText) {
    return ExternalEditor.SublimeText
  }
  if (label === ExternalEditor.CFBuilder) {
    return ExternalEditor.CFBuilder
  }
  if (label === ExternalEditor.Typora) {
    return ExternalEditor.Typora
  }
  if (label === ExternalEditor.SlickEdit) {
    return ExternalEditor.SlickEdit
  }

  return null
}

/**
 * Resolve a set of registry keys associated with the installed application.
 *
 * This is because some tools (like VSCode) may support a 64-bit or 32-bit
 * version of the tool - we should use whichever they have installed.
 *
 * @param editor The external editor that may be installed locally.
 */
function getRegistryKeys(
  editor: ExternalEditor
): ReadonlyArray<{ key: HKEY; subKey: string }> {
  switch (editor) {
    case ExternalEditor.Atom:
      return [
        {
          key: HKEY.HKEY_CURRENT_USER,
          subKey:
            'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\atom',
        },
      ]
    case ExternalEditor.VisualStudioCode:
      return [
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
      ]
    case ExternalEditor.VisualStudioCodeInsiders:
      return [
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
      ]
    case ExternalEditor.SublimeText:
      return [
        {
          key: HKEY.HKEY_LOCAL_MACHINE,
          subKey:
            'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Sublime Text 3_is1',
        },
      ]
    case ExternalEditor.CFBuilder:
      return [
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
      ]
    case ExternalEditor.Typora:
      return [
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
      ]
    case ExternalEditor.SlickEdit:
      return [
        // 64-bit version of Visual SlickEdit Pro 2018
        {
          key: HKEY.HKEY_LOCAL_MACHINE,
          subKey:
            'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{18406187-F49E-4822-CAF2-1D25C0C83BA2}',
        },
        // 32-bit version of Visual SlickEdit Pro 2018
        {
          key: HKEY.HKEY_LOCAL_MACHINE,
          subKey:
            'SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{18006187-F49E-4822-CAF2-1D25C0C83BA2}',
        },
        // 64-bit version of Visual SlickEdit Standard 2018
        {
          key: HKEY.HKEY_LOCAL_MACHINE,
          subKey:
            'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{18606187-F49E-4822-CAF2-1D25C0C83BA2}',
        },
        // 32-bit version of Visual SlickEdit Standard 2018
        {
          key: HKEY.HKEY_LOCAL_MACHINE,
          subKey:
            'SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{18206187-F49E-4822-CAF2-1D25C0C83BA2}',
        },
        // 64-bit version of Visual SlickEdit Pro 2017
        {
          key: HKEY.HKEY_LOCAL_MACHINE,
          subKey:
            'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{15406187-F49E-4822-CAF2-1D25C0C83BA2}',
        },
        // 32-bit version of Visual SlickEdit Pro 2017
        {
          key: HKEY.HKEY_LOCAL_MACHINE,
          subKey:
            'SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{15006187-F49E-4822-CAF2-1D25C0C83BA2}',
        },
        // 64-bit version of Visual SlickEdit Pro 2016 (21.0.1)
        {
          key: HKEY.HKEY_LOCAL_MACHINE,
          subKey:
            'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{10C06187-F49E-4822-CAF2-1D25C0C83BA2}',
        },
        // 64-bit version of Visual SlickEdit Pro 2016 (21.0.0)
        {
          key: HKEY.HKEY_LOCAL_MACHINE,
          subKey:
            'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{10406187-F49E-4822-CAF2-1D25C0C83BA2}',
        },
        // 64-bit version of Visual SlickEdit Pro 2015 (20.0.3)
        {
          key: HKEY.HKEY_LOCAL_MACHINE,
          subKey:
            'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{0DC06187-F49E-4822-CAF2-1D25C0C83BA2}',
        },
        // 64-bit version of Visual SlickEdit Pro 2015 (20.0.2)
        {
          key: HKEY.HKEY_LOCAL_MACHINE,
          subKey:
            'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{0D406187-F49E-4822-CAF2-1D25C0C83BA2}',
        },
        // 64-bit version of Visual SlickEdit Pro 2014 (19.0.2)
        {
          key: HKEY.HKEY_LOCAL_MACHINE,
          subKey:
            'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{7CC0E567-ACD6-41E8-95DA-154CEEDB0A18}',
        },
      ]

    default:
      return assertNever(editor, `Unknown external editor: ${editor}`)
  }
}

/**
 * Resolve the command-line interface for the editor.
 *
 * @param editor The external editor which is installed
 * @param installLocation The known install location of the editor
 */
function getExecutableShim(
  editor: ExternalEditor,
  installLocation: string
): string {
  switch (editor) {
    case ExternalEditor.Atom:
      return Path.join(installLocation, 'bin', 'atom.cmd')
    case ExternalEditor.VisualStudioCode:
      return Path.join(installLocation, 'bin', 'code.cmd')
    case ExternalEditor.VisualStudioCodeInsiders:
      return Path.join(installLocation, 'bin', 'code-insiders.cmd')
    case ExternalEditor.SublimeText:
      return Path.join(installLocation, 'subl.exe')
    case ExternalEditor.CFBuilder:
      return Path.join(installLocation, 'CFBuilder.exe')
    case ExternalEditor.Typora:
      return Path.join(installLocation, 'bin', 'typora.exe')
    case ExternalEditor.SlickEdit:
      return Path.join(installLocation, 'win', 'vs.exe')
    default:
      return assertNever(editor, `Unknown external editor: ${editor}`)
  }
}

/**
 * Confirm the found installation matches the expected identifier details
 *
 * @param editor The external editor
 * @param displayName The display name as listed in the registry
 * @param publisher The publisher who created the installer
 */
function isExpectedInstallation(
  editor: ExternalEditor,
  displayName: string,
  publisher: string
): boolean {
  switch (editor) {
    case ExternalEditor.Atom:
      return displayName === 'Atom' && publisher === 'GitHub Inc.'
    case ExternalEditor.VisualStudioCode:
      return (
        displayName.startsWith('Microsoft Visual Studio Code') &&
        publisher === 'Microsoft Corporation'
      )
    case ExternalEditor.VisualStudioCodeInsiders:
      return (
        displayName.startsWith('Microsoft Visual Studio Code Insiders') &&
        publisher === 'Microsoft Corporation'
      )
    case ExternalEditor.SublimeText:
      return (
        displayName === 'Sublime Text' && publisher === 'Sublime HQ Pty Ltd'
      )
    case ExternalEditor.CFBuilder:
      return (
        (displayName === 'Adobe ColdFusion Builder 3' ||
          displayName === 'Adobe ColdFusion Builder 2016') &&
        publisher === 'Adobe Systems Incorporated'
      )
    case ExternalEditor.Typora:
      return displayName.startsWith('Typora') && publisher === 'typora.io'
    case ExternalEditor.SlickEdit:
      return displayName.startsWith('SlickEdit') && publisher === 'SlickEdit Inc.'
    default:
      return assertNever(editor, `Unknown external editor: ${editor}`)
  }
}

function getKeyOrEmpty(
  keys: ReadonlyArray<RegistryValue>,
  key: string
): string {
  const entry = keys.find(k => k.name === key)
  return entry && entry.type === RegistryValueType.REG_SZ ? entry.data : ''
}

/**
 * Map the registry information to a list of known installer fields.
 *
 * @param editor The external editor being resolved
 * @param keys The collection of registry key-value pairs
 */
function extractApplicationInformation(
  editor: ExternalEditor,
  keys: ReadonlyArray<RegistryValue>
): { displayName: string; publisher: string; installLocation: string } {
  if (editor === ExternalEditor.Atom) {
    const displayName = getKeyOrEmpty(keys, 'DisplayName')
    const publisher = getKeyOrEmpty(keys, 'Publisher')
    const installLocation = getKeyOrEmpty(keys, 'InstallLocation')
    return { displayName, publisher, installLocation }
  }

  if (
    editor === ExternalEditor.VisualStudioCode ||
    editor === ExternalEditor.VisualStudioCodeInsiders
  ) {
    const displayName = getKeyOrEmpty(keys, 'DisplayName')
    const publisher = getKeyOrEmpty(keys, 'Publisher')
    const installLocation = getKeyOrEmpty(keys, 'InstallLocation')
    return { displayName, publisher, installLocation }
  }

  if (editor === ExternalEditor.SublimeText) {
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
  }

  if (editor === ExternalEditor.CFBuilder) {
    const displayName = getKeyOrEmpty(keys, 'DisplayName')
    const publisher = getKeyOrEmpty(keys, 'Publisher')
    const installLocation = getKeyOrEmpty(keys, 'InstallLocation')
    return { displayName, publisher, installLocation }
  }

  if (editor === ExternalEditor.Typora) {
    const displayName = getKeyOrEmpty(keys, 'DisplayName')
    const publisher = getKeyOrEmpty(keys, 'Publisher')
    const installLocation = getKeyOrEmpty(keys, 'InstallLocation')
    return { displayName, publisher, installLocation }
  }

  if (editor === ExternalEditor.SlickEdit) {
    const displayName = getKeyOrEmpty(keys, 'DisplayName')
    const publisher = getKeyOrEmpty(keys, 'Publisher')
    const installLocation = getKeyOrEmpty(keys, 'InstallLocation')
    return { displayName, publisher, installLocation }
  }

  return assertNever(editor, `Unknown external editor: ${editor}`)
}

async function findApplication(editor: ExternalEditor): Promise<string | null> {
  const registryKeys = getRegistryKeys(editor)

  let keys: ReadonlyArray<RegistryValue> = []
  for (const { key, subKey } of registryKeys) {
    keys = enumerateValues(key, subKey)
    if (keys.length > 0) {
      break
    }
  }

  if (keys.length === 0) {
    return null
  }

  const {
    displayName,
    publisher,
    installLocation,
  } = extractApplicationInformation(editor, keys)

  if (!isExpectedInstallation(editor, displayName, publisher)) {
    log.debug(
      `Registry entry for ${editor} did not match expected publisher settings`
    )
    return null
  }

  const path = getExecutableShim(editor, installLocation)
  const exists = await pathExists(path)
  if (!exists) {
    log.debug(`Command line interface for ${editor} not found at '${path}'`)
    return null
  }

  return path
}

/**
 * Lookup known external editors using the Windows registry to find installed
 * applications and their location on disk for Desktop to launch.
 */
export async function getAvailableEditors(): Promise<
  ReadonlyArray<IFoundEditor<ExternalEditor>>
> {
  const results: Array<IFoundEditor<ExternalEditor>> = []

  const [
    atomPath,
    codePath,
    codeInsidersPath,
    sublimePath,
    cfBuilderPath,
    typoraPath,
    slickeditPath,
  ] = await Promise.all([
    findApplication(ExternalEditor.Atom),
    findApplication(ExternalEditor.VisualStudioCode),
    findApplication(ExternalEditor.VisualStudioCodeInsiders),
    findApplication(ExternalEditor.SublimeText),
    findApplication(ExternalEditor.CFBuilder),
    findApplication(ExternalEditor.Typora),
    findApplication(ExternalEditor.SlickEdit),
  ])

  if (atomPath) {
    results.push({
      editor: ExternalEditor.Atom,
      path: atomPath,
    })
  }

  if (codePath) {
    results.push({
      editor: ExternalEditor.VisualStudioCode,
      path: codePath,
    })
  }

  if (codeInsidersPath) {
    results.push({
      editor: ExternalEditor.VisualStudioCodeInsiders,
      path: codeInsidersPath,
    })
  }

  if (sublimePath) {
    results.push({
      editor: ExternalEditor.SublimeText,
      path: sublimePath,
    })
  }

  if (cfBuilderPath) {
    results.push({
      editor: ExternalEditor.CFBuilder,
      path: cfBuilderPath,
    })
  }

  if (typoraPath) {
    results.push({
      editor: ExternalEditor.Typora,
      path: typoraPath,
    })
  }

  if (slickeditPath) {
    results.push({
      editor: ExternalEditor.SlickEdit,
      path: slickeditPath,
    })
  }

  return results
}
