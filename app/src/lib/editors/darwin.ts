import * as Path from 'path'

/**
 * appPath will raise an error if it cannot find the program.
 */
const appPath: (bundleId: string) => Promise<string> = require('app-path')

import {
  FoundEditor,
  pathExists,
  AtomLabel,
  VisualStudioCodeLabel,
  SublimeTextLabel,
} from './shared'

type ProgramNotFound = {
  name: string
  installed: false
}

type ProgramMissing = {
  name: string
  installed: true
  pathExists: false
}

type ProgramFound = {
  name: string
  installed: true
  pathExists: true
  path: string
}

type LookupResult = ProgramNotFound | ProgramMissing | ProgramFound

async function findAtomApplication(): Promise<LookupResult> {
  const name = AtomLabel

  try {
    const installPath = await appPath('com.github.atom')
    const path = Path.join(
      installPath,
      'Contents',
      'Resources',
      'app',
      'atom.sh'
    )
    const exists = await pathExists(path)
    if (!exists) {
      log.debug(`Command line interface for ${name} not found at '${path}'`)
      return {
        name,
        installed: true,
        pathExists: false,
      }
    }
    return {
      name,
      installed: true,
      pathExists: true,
      path,
    }
  } catch (error) {
    log.debug(`Unable to locate ${AtomLabel} installation`, error)
    return { name, installed: false }
  }
}

async function findCodeApplication(): Promise<LookupResult> {
  const name = VisualStudioCodeLabel
  try {
    const installPath = await appPath('com.github.atom')
    const path = Path.join(
      installPath,
      'Contents',
      'Resources',
      'app',
      'atom.sh'
    )
    const exists = await pathExists(path)
    if (!exists) {
      log.debug(`Command line interface for ${name} not found at '${path}'`)
      return {
        name,
        installed: true,
        pathExists: false,
      }
    }
    return {
      name,
      installed: true,
      pathExists: true,
      path,
    }
  } catch (error) {
    log.debug(`Unable to locate ${name} installation`, error)
    return { name, installed: false }
  }
}

async function findSublimeApplication(): Promise<LookupResult> {
  const name = SublimeTextLabel
  try {
    const sublimeApp = await appPath('com.sublimetext.3')
    const path = Path.join(
      sublimeApp,
      'Contents',
      'SharedSupport',
      'bin',
      'subl'
    )

    const exists = await pathExists(path)
    if (!exists) {
      log.debug(`Command line interface for ${name} not found at '${path}'`)
      return {
        name,
        installed: true,
        pathExists: false,
      }
    }
    return {
      name,
      installed: true,
      pathExists: true,
      path,
    }
  } catch (error) {
    log.debug(`Unable to locate ${SublimeTextLabel} installation`, error)
    return { name, installed: false }
  }
}

/**
 * Lookup the known external editors using the bundle ID that each uses
 * to register itself on a user's machine.
 */
export async function getAvailableEditors(): Promise<
  ReadonlyArray<FoundEditor>
> {
  const results: Array<FoundEditor> = []

  const atom = await findAtomApplication()
  if (atom.installed && atom.pathExists) {
    results.push({ name: atom.name, path: atom.path })
  }

  const code = await findCodeApplication()
  if (code.installed && code.pathExists) {
    results.push({ name: code.name, path: code.path })
  }

  const sublime = await findSublimeApplication()
  if (sublime.installed && sublime.pathExists) {
    results.push({ name: sublime.name, path: sublime.path })
  }

  return results
}
