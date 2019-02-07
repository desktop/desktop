/* eslint-disable no-sync */

import * as FSE from 'fs-extra'
import * as path from 'path'
import * as os from 'os'

// TODO: we have types for this
const klawSync = require('klaw-sync')

type KlawEntry = {
  path: string
}

import { getProductName } from '../../../app/package-info'
// TODO: maybe this needs to live inside app
import { getExecutableName } from '../../../script/dist-info'

function getUserDataPath() {
  if (process.platform === 'win32') {
    if (process.env.APPDATA) {
      return path.join(process.env.APPDATA, getExecutableName())
    } else {
      throw new Error(
        `Unable to find the application data directory on Windows :(`
      )
    }
  } else if (process.platform === 'darwin') {
    const home = os.homedir()
    return path.join(home, 'Library', 'Application Support', getProductName())
  } else if (process.platform === 'linux') {
    if (process.env.XDG_CONFIG_HOME) {
      return path.join(process.env.XDG_CONFIG_HOME, getProductName())
    }
    const home = os.homedir()
    return path.join(home, '.config', getProductName())
  } else {
    throw new Error(
      `I dunno how to resolve the user data path for ${process.platform} ${
        process.arch
      } :(`
    )
  }
}

export function setupLogsDirectory() {
  FSE.mkdirpSync(getLogsDirectory())
}

export function getLogsDirectory(): string {
  return path.join(getUserDataPath(), 'logs')
}

function isLogFile(item: KlawEntry) {
  return path.extname(item.path) === '.log'
}

export async function getLogFiles(): Promise<ReadonlyArray<string>> {
  const directory = getLogsDirectory()
  const exists = await FSE.pathExists(directory)

  if (!exists) {
    console.log(`no test directory found...`)
    return []
  }

  const entries: ReadonlyArray<KlawEntry> = klawSync(directory, { nodir: true })

  return entries.filter(isLogFile).map(l => l.path)
}
