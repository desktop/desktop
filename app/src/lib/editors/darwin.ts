const appPath: (id: string) => Promise<string> = require('app-path')

import * as Fs from 'fs'

import { FoundEditor } from './models'

function pathExists(path: string): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    Fs.exists(path, exists => {
      resolve(exists)
    })
  })
}

export async function getAvailableEditors(): Promise<
  ReadonlyArray<FoundEditor>
  > {
  const results: Array<FoundEditor> = []

  const atomLabel = 'Atom'

  try {
    await appPath('com.github.atom')
    const path = '/usr/local/bin/atom'
    const exists = await pathExists(path)
    if (exists) {
      results.push({ app: atomLabel, path })
    } else {
      log.info(`Command line interface for ${atomLabel} not found at '${path}'`)
    }
  } catch (error) {
    log.debug(`Unable to locate ${atomLabel} installation`, error)
  }

  const codeLabel = 'Visual Studio Code'
  try {
    await appPath('com.microsoft.VSCode')
    const path = '/usr/local/bin/code'
    const exists = await pathExists(path)
    if (exists) {
      results.push({ app: codeLabel, path })
    } else {
      log.info(`Command line interface for ${codeLabel} not found at '${path}'`)
    }
  } catch (error) {
    log.debug(`Unable to locate ${codeLabel} installation`, error)
  }

  const sublimeLabel = 'Sublime Text'
  try {
    const path = await appPath('com.sublimetext.3')
    // TODO: does a shim exist? what should I be invoking?
    const sublime = { app: sublimeLabel, path }
    results.push(sublime)
  } catch (error) {
    log.debug(`Unable to locate ${codeLabel} installation`, error)
  }

  return results
}
