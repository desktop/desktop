import * as Path from 'path'
import { readKeys } from './registry'

import {
  LookupResult,
  FoundEditor,
  AtomLabel,
  VisualStudioCodeLabel,
  SublimeTextLabel,
  pathExists,
} from './shared'

/**
 * Find the Atom executable shim using the install information from the
 * registry.
 */
async function findAtomApplication(): Promise<LookupResult> {
  const name = AtomLabel
  try {
    const keys = await readKeys(
      'HKEY_CURRENT_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\atom'
    )

    let displayName = ''
    let publisher = ''
    let installLocation = ''

    for (const item of keys) {
      if (item.name === 'DisplayName') {
        displayName = item.value
      } else if (item.name === 'Publisher') {
        publisher = item.value
      } else if (item.name === 'InstallLocation') {
        installLocation = item.value
      }
    }

    const isExpectedInstall =
      displayName === 'Atom' && publisher === 'GitHub Inc.'

    if (!isExpectedInstall) {
      log.debug(
        `Registry entry for ${name} did not match expected publisher settings`
      )
      return {
        name,
        installed: true,
        pathExists: false,
      }
    }

    const path = Path.join(installLocation, 'bin', 'atom.cmd')
    const exists = await pathExists(path)
    if (!exists) {
      log.debug(`Command line interface for ${name} not found at '${path}'`)
      return {
        name,
        installed: true,
        pathExists: false,
      }
    } else {
      return {
        name,
        installed: true,
        pathExists: true,
        path,
      }
    }
  } catch (error) {
    log.debug(`Unable to locate ${name} installation`, error)
    return { name, installed: false }
  }
}

/**
 * Find the Visual Studio Code executable shim using the install information
 * from the registry.
 */
async function findCodeApplication(): Promise<LookupResult> {
  const name = VisualStudioCodeLabel

  try {
    const keys = await readKeys(
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{F8A2A208-72B3-4D61-95FC-8A65D340689B}_is1'
    )

    let displayName = ''
    let publisher = ''
    let installLocation = ''

    for (const item of keys) {
      if (item.name === 'Inno Setup: Icon Group') {
        displayName = item.value
      } else if (item.name === 'Publisher') {
        publisher = item.value
      } else if (item.name === 'Inno Setup: App Path') {
        installLocation = item.value
      }
    }

    const isExpectedInstall =
      displayName === 'Visual Studio Code' &&
      publisher === 'Microsoft Corporation'

    if (!isExpectedInstall) {
      log.debug(
        `Registry entry for ${name} did not match expected publisher settings`
      )
      return {
        name,
        installed: true,
        pathExists: false,
      }
    }

    const path = Path.join(installLocation, 'bin', 'code.cmd')
    const exists = await pathExists(path)
    if (!exists) {
      log.debug(`Command line interface for ${name} not found at '${path}'`)
      return {
        name,
        installed: true,
        pathExists: false,
      }
    } else {
      return {
        name,
        installed: true,
        pathExists: true,
        path,
      }
    }
  } catch (error) {
    log.debug(`Unable to locate ${name} installation`, error)
    return { name, installed: false }
  }
}

/**
 * Find the Sublime Text executable shim using the install information from the
 * registry.
 */
export async function findSublimeTextApplication(): Promise<LookupResult> {
  const name = SublimeTextLabel

  try {
    const keys = await readKeys(
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Sublime Text 3_is1'
    )

    let displayName = ''
    let publisher = ''
    let installLocation = ''

    for (const item of keys) {
      if (item.name === 'Inno Setup: Icon Group') {
        displayName = item.value
      } else if (item.name === 'Publisher') {
        publisher = item.value
      } else if (item.name === 'Inno Setup: App Path') {
        installLocation = item.value
      }
    }

    const expectedInstall =
      displayName === 'Sublime Text' && publisher === 'Sublime HQ Pty Ltd'

    if (!expectedInstall) {
      log.debug(
        `Registry entry for ${name} did not match expected publisher settings`
      )
      return {
        name,
        installed: true,
        pathExists: false,
      }
    }

    const path = Path.join(installLocation, 'subl.exe')
    const exists = await pathExists(path)
    if (!exists) {
      log.debug(`Command line interface for ${name} not found at '${path}'`)
      return {
        name,
        installed: true,
        pathExists: false,
      }
    } else {
      return {
        name,
        installed: true,
        pathExists: true,
        path,
      }
    }
  } catch (error) {
    log.debug(`Unable to locate ${name} installation`, error)
    return { name, installed: false }
  }
}

/**
 * Lookup the known external editors using the Windows registry to find the
 * installed applications and their location.
 */
export async function getAvailableEditors(): Promise<
  ReadonlyArray<FoundEditor>
> {
  const results: Array<FoundEditor> = []

  const [atom, code, sublime] = await Promise.all([
    findAtomApplication(),
    findCodeApplication(),
    findSublimeTextApplication(),
  ])

  if (atom.installed && atom.pathExists) {
    results.push({ name: atom.name, path: atom.path })
  }

  if (code.installed && code.pathExists) {
    results.push({ name: code.name, path: code.path })
  }

  if (sublime.installed && sublime.pathExists) {
    results.push({ name: sublime.name, path: sublime.path })
  }

  return results
}

/**
 * Find the first editor that exists on the user's machine, or return null if
 * no matches are found.
 */
export async function getFirstEditorOrDefault(): Promise<FoundEditor | null> {
  const atom = await findAtomApplication()
  if (atom.installed && atom.pathExists) {
    return { name: atom.name, path: atom.path }
  }

  const code = await findCodeApplication()
  if (code.installed && code.pathExists) {
    return { name: code.name, path: code.path }
  }

  const sublime = await findSublimeTextApplication()
  if (sublime.installed && sublime.pathExists) {
    return { name: sublime.name, path: sublime.path }
  }

  return null
}
