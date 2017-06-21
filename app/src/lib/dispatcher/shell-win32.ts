import * as Path from 'path'
import * as glob from 'glob'
import * as Register from 'winreg'
import { Repository } from '../../models/repository'

export interface IEditorInfo {
  readonly name: string
  readonly exec: () => void
}

//import * as Path from 'path'

export function isVisualStudioInstalled(): Promise<boolean> {
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

  const find = function(i: number, resolve: (value: boolean) => void, reject: (value: any) => void )  {
    if (i >= keys.length) {
      resolve(false)
    } else {
      new Register({
        hive: Register.HKCR,
        key: keys[i],
      }).get('', (err: Error, result: Register.RegistryItem) => {

        if (err) {
          find( i + 1, resolve, reject)
        } else {
          resolve(true)
        }
      })
    }
  }

  return new Promise<boolean>( (resolve, reject) => {
    find(0, resolve, reject)
  })
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

class VisualStudioEditor implements IEditorInfo {
  private readonly path: string
  public readonly name: string
  public constructor(path: string) {
    this.path = path
    if (path.length > 15) {
      path = '...' + path.substr(path.length - 12)
    }
    this.name = 'Visual Studio ( ' + path + ')'
  }

  public exec(): void {
    console.log('exec ' + this.path)
  }
}

class AppLauncher implements IEditorInfo {
  public readonly name: string
  private readonly path: string
  public constructor(name: string, path: string) {
    this.name = name
    this.path = path
  }

  public exec(): void {
    console.log('exec ' + this.path)
  }
}
function buildVisualStudioSolutionLaunchers(repository: Repository): Promise<IEditorInfo[]> {

  return isVisualStudioInstalled()
  .then( (res) => {
    const editors = new Array<IEditorInfo>()
    if (res) {
      // Find all results
      return new Promise( (resolve, reject) => {
        glob( Path.join( repository.path, '**/*.sln'), (err, matches) => {
          if (!err) {
            for (let i = 0; i < matches.length; i++) {
              console.log(matches[i])
              editors.push( new VisualStudioEditor( matches[i] ) )
            }
            resolve(editors)
          } else {
            reject(err)
          }
        })
      })
    } else {
      // return empty list
      return Promise.resolve(editors)
    }
  })
}

function buildAtomLauncher(repository: Repository): Promise<IEditorInfo[]> {
  const editors = new Array<IEditorInfo>()

  return new Promise( (result, reject) => {
    new Register({
      hive: Register.HKCU,
      key: '\\Software\\Classes\\Applications\\atom.exe\\shell\\open\\command',
    }).get('', (err: Error, reg: Register.RegistryItem) => {
      if (err == null) {
        const cmd = reg.value.replace('%1', repository.path)
        editors.push( new AppLauncher('Atom', cmd))
      }
      result(editors)
    })
  })
}

/**
 * Finds editors for a given repository.  Such as solution or workspace files
 * for known applications
 * @param repository  Repository to search
 */
export function getEditorsForRepository(repository: Repository): Promise<IEditorInfo[]> {

  const editors = new Array<IEditorInfo>()

  return buildVisualStudioSolutionLaunchers(repository)
  .then( (res) => {
    // Visual Studio Solutions (if any)
    editors.push.apply( editors, res )
    return buildAtomLauncher(repository)
  })
  .then( (res) => {
    // Atom launcher if any
    editors.push.apply( editors, res )

    console.log('All Editors: ' +  editors )
    return Promise.resolve(editors)
  })

}

export function getEditorsForItem(path: string) {


}