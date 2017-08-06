import * as path from 'path'

type RegistryItem = {
  name: string
  value: string
  type: string
}

const Registry = require('winreg')

export function findAtomExecutable(): Promise<string> {
  return new Promise((resolve, reject) => {
    const regKey = new Registry({
      hive: Registry.HKCU,
      key: '\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\atom',
    })

    regKey.values(function(
      err: Error | null,
      items: ReadonlyArray<RegistryItem>
    ) {
      if (err) {
        reject(err)
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

      if (displayName === 'Atom' && publisher === 'GitHub Inc.') {
        resolve(path.join(installLocation, 'atom.exe'))
        return
      }

      console.debug('Registry entry does not match expected settings for Atom')
      resolve('')
    })
  })
}

export function findSublimeTextExecutable(): Promise<string> {
  return new Promise((resolve, reject) => {
    const Registry = require('winreg')
    const regKey = new Registry({
      hive: Registry.HKLM,
      key:
        '\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Sublime Text 3_is1',
    })

    regKey.values(function(
      err: Error | null,
      items: ReadonlyArray<any> /* array of RegistryItem */
    ) {
      if (err) {
        reject(err)
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

      if (
        displayName === 'Sublime Text' &&
        publisher === 'Sublime HQ Pty Ltd'
      ) {
        resolve(path.join(installLocation, 'sublime_text.exe'))
        return
      }

      console.debug(
        'Registry entry does not match expected settings for Sublime Text'
      )
      resolve('')
    })
  })
}
