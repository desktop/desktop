import * as path from 'path'

export type EditorLookup = {
  app: string
  path: string
}

async function getAvailableEditorsDarwin(): Promise<
  ReadonlyArray<EditorLookup>
> {
  const appPath: (id: string) => Promise<string> = require('app-path')

  const atom = await appPath('com.github.atom')
    .catch(error => {
      log.debug('Unable to locate Atom installation', error)
      return ''
    })
    .then(path => {
      return { app: 'Atom', path }
    })

  const code = await appPath('com.microsoft.VSCode')
    .catch(error => {
      log.debug('Unable to locate VSCode installation', error)
      return ''
    })
    .then(path => {
      return { app: 'Visual Studio Code', path }
    })

  // TODO: what about Sublime Text 2?
  const sublime = await appPath('com.sublimetext.3')
    .catch(error => {
      log.debug('Unable to locate Sublime Text installation', error)
      return ''
    })
    .then(path => {
      return { app: 'Sublime Text', path }
    })

  const results = [atom, code, sublime]
  return results.filter(result => result.path !== '')
}

type RegistryItem = {
  name: string
  value: string
  type: string
}

function findAtomExecutable(): Promise<string> {
  return new Promise((resolve, reject) => {
    const Registry = require('winreg')
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

function findSublimeTextExecutable(): Promise<string> {
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

async function getAvailableEditorsWindows(): Promise<
  ReadonlyArray<EditorLookup>
> {
  // Atom - look for the uninstall registry entry and then read it's path
  //        registry entry: `Computer\HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Uninstall\atom`
  //        interesting keys: `DisplayName=Atom` and `Publisher=GitHub Inc`
  //        value we want: `InstallLocation=C:\Users\shiftkey\AppData\Local\atom`
  //        can then launch path.join($InstallLocation, 'atom.exe') with the provided path
  const atom = await findAtomExecutable()
    .catch(error => {
      log.debug('Unable to locate Atom installation', error)
      return ''
    })
    .then(path => {
      return { app: 'Atom', path }
    })

  // VSCode - no real registry results that are easily to find short of enumerating. what to do?
  const code = await Promise.resolve('')
    .catch(error => {
      log.debug('Unable to locate VSCode installation', error)
      return ''
    })
    .then(path => {
      return { app: 'Sublime Text', path }
    })

  // Sublime Text
  const sublime = await findSublimeTextExecutable()
    .catch(error => {
      log.debug('Unable to locate Sublime text installation', error)
      return ''
    })
    .then(path => {
      return { app: 'Sublime Text', path }
    })

  const results = [atom, code, sublime]
  return results.filter(result => result.path !== '')
}

export function getAvailableEditors(): Promise<ReadonlyArray<EditorLookup>> {
  if (__DARWIN__) {
    return getAvailableEditorsDarwin()
  }

  if (__WIN32__) {
    return getAvailableEditorsWindows()
  }

  console.warn(
    `Platform not currently supported for resolving editors: ${process.platform}`
  )
  return Promise.resolve([])
}
