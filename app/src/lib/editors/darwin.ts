import * as Path from 'path'

/**
 * appPath will raise an error if it cannot find the program.
 */
const appPath: (bundleId: string) => Promise<string> = require('app-path')

import {
  LookupResult,
  FoundEditor,
  pathExists,
  AtomLabel,
  VisualStudioCodeLabel,
  SublimeTextLabel,
} from './shared'

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
    log.debug(`Unable to locate ${name} installation`, error)
    return { name, installed: false }
  }
}

async function findCodeApplication(): Promise<LookupResult> {
  const name = VisualStudioCodeLabel
  try {
    const installPath = await appPath('com.microsoft.VSCode')
    const path = Path.join(
      installPath,
      'Contents',
      'Resources',
      'app',
      'bin',
      'code'
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

async function findSublimeTextApplication(): Promise<LookupResult> {
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
