import * as Fs from 'fs'
import * as Path from 'path'

/**
 * appPath will raise an error if it cannot find the program.
 */
const appPath: (bundleId: string) => Promise<string> = require('app-path')

import {
  FoundEditor,
  AtomLabel,
  VisualStudioCodeLabel,
  SublimeTextLabel,
} from './shared'

function pathExists(path: string): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    Fs.exists(path, exists => {
      resolve(exists)
    })
  })
}

/**
 * Lookup the known external editors using the bundle ID that each uses
 * to register itself on a user's machine.
 */
export async function getAvailableEditors(): Promise<
  ReadonlyArray<FoundEditor>
> {
  const results: Array<FoundEditor> = []

  try {
    // invoked without assigning the result so we verify the app is installed
    await appPath('com.github.atom')
    const shimPath = '/usr/local/bin/atom'
    const exists = await pathExists(shimPath)
    if (exists) {
      results.push({ name: AtomLabel, path: shimPath })
    } else {
      log.info(
        `Command line interface for ${AtomLabel} not found at '${shimPath}'`
      )
    }
  } catch (error) {
    log.debug(`Unable to locate ${AtomLabel} installation`, error)
  }

  try {
    // invoked without assigning the result so we verify the app is installed
    await appPath('com.microsoft.VSCode')
    const shimPath = '/usr/local/bin/code'
    const exists = await pathExists(shimPath)
    if (exists) {
      results.push({ name: VisualStudioCodeLabel, path: shimPath })
    } else {
      log.info(
        `Command line interface for ${VisualStudioCodeLabel} not found at '${shimPath}'`
      )
    }
  } catch (error) {
    log.debug(`Unable to locate ${VisualStudioCodeLabel} installation`, error)
  }

  try {
    const sublimeApp = await appPath('com.sublimetext.3')
    const path = Path.join(
      sublimeApp,
      'Contents',
      'SharedSupport',
      'bin',
      'subl'
    )
    const sublime = { name: SublimeTextLabel, path }
    results.push(sublime)
  } catch (error) {
    log.debug(`Unable to locate ${SublimeTextLabel} installation`, error)
  }

  return results
}
