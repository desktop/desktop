import * as Path from 'path'
import * as Registry from 'winreg'

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
function findAtomApplication(): Promise<LookupResult> {
  return new Promise<LookupResult>((resolve, reject) => {
    const name = AtomLabel
    const regKey = new Registry({
      hive: Registry.HKCU,
      key: '\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\atom',
    })

    regKey.values((error, items) => {
      if (error) {
        log.debug(`Unable to locate ${name} installation`, error)
        resolve({ name, installed: false })
        return
      }

      let displayName = ''
      let publisher = ''
      let installLocation = ''

      for (const item of items) {
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
        resolve({
          name,
          installed: true,
          pathExists: false,
        })
        return
      }

      const path = Path.join(installLocation, 'bin', 'atom.cmd')
      pathExists(path).then(exists => {
        if (!exists) {
          log.debug(`Command line interface for ${name} not found at '${path}'`)
          resolve({
            name,
            installed: true,
            pathExists: false,
          })
        } else {
          resolve({
            name,
            installed: true,
            pathExists: true,
            path,
          })
        }
      })
    })
  })
}

/**
 * Find the Visual Studio Code executable shim using the install information
 * from the registry.
 */
function findCodeApplication(): Promise<LookupResult> {
  return new Promise<LookupResult>((resolve, reject) => {
    const name = VisualStudioCodeLabel
    const regKey = new Registry({
      hive: Registry.HKLM,
      key:
        '\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{F8A2A208-72B3-4D61-95FC-8A65D340689B}_is1',
    })

    regKey.values((error, items) => {
      if (error) {
        log.debug(`Unable to locate ${name} installation`, error)
        resolve({ name, installed: false })
        return
      }

      let displayName = ''
      let publisher = ''
      let installLocation = ''

      for (const item of items) {
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
        resolve({
          name,
          installed: true,
          pathExists: false,
        })
        return
      }

      const path = Path.join(installLocation, 'bin', 'code.cmd')
      pathExists(path).then(exists => {
        if (!exists) {
          log.debug(`Command line interface for ${name} not found at '${path}'`)
          resolve({
            name,
            installed: true,
            pathExists: false,
          })
        } else {
          resolve({
            name,
            installed: true,
            pathExists: true,
            path,
          })
        }
      })
    })
  })
}

/**
 * Find the Sublime Text executable shim using the install information from the
 * registry.
 */
export function findSublimeTextApplication(): Promise<LookupResult> {
  return new Promise((resolve, reject) => {
    const name = SublimeTextLabel

    const regKey = new Registry({
      hive: Registry.HKLM,
      key:
        '\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Sublime Text 3_is1',
    })

    regKey.values((error, items) => {
      if (error) {
        log.debug(`Unable to locate ${name} installation`, error)
        resolve({ name, installed: false })
        return
      }

      let displayName = ''
      let publisher = ''
      let installLocation = ''

      for (const item of items) {
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
        resolve({
          name,
          installed: true,
          pathExists: false,
        })
        return
      }

      const path = Path.join(installLocation, 'subl.exe')
      pathExists(path).then(exists => {
        if (!exists) {
          log.debug(`Command line interface for ${name} not found at '${path}'`)
          resolve({
            name,
            installed: true,
            pathExists: false,
          })
        } else {
          resolve({
            name,
            installed: true,
            pathExists: true,
            path,
          })
        }
      })
    })
  })
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
