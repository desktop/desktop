import * as Register from 'winreg'

//import * as Path from 'path'

export function isVisualStudioInstalled() {
  const keys = [
    '\\VisualStudio.DTE.8.0',  // 2005
    '\\VisualStudio.DTE.9.0',  // 2008
    '\\VisualStudio.DTE.10.0', // 2010
    '\\VisualStudio.DTE.11.0', // 2012
    '\\VisualStudio.DTE.12.0', // 2013
    '\\VisualStudio.DTE.13.0', // ? not sure what version this is
    '\\VisualStudio.DTE.14.0', // 2015
    '\\VisualStudio.DTE.15.0', // 2017
  ]

  let found = false
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    new Register({
      hive: Register.HKCR,
      key: key,
    }).get('', (err: Error, result: Register.RegistryItem) => {
      if (err == null) {
        found = true
      }
    })

    if (found) {
       break
    }
  }

  return found
}

export function isVisualStudioCodeInstalled() {
    let found = false
    new Register({
      hive: Register.HKCR,
      key: '\\vscode',
    }).get('', (err: Error, result: Register.RegistryItem) => {
      if (err == null) {
        found = true
      }
    })

    return found
}

export function findAtomApplication() {
  let path = null
    new Register({
      hive: Register.HKCU,
      key: '\\Software\\Classes\\Aplications\atom.exe\shell\open\command',
    }).get('', (err: Error, result: Register.RegistryItem) => {
      if (err == null) {
        // TODO: remove "%1" from end..
        path = result.value
      }
    })

    return path
}

export function isAtomInstalled() {
    const path = findAtomApplication()
    return path != null
}