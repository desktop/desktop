/* eslint-disable no-sync */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { getProductName } from '../app/package-info'
import { getExecutableName } from './dist-info'

// TODO: we have types for this
const klawSync = require('klaw-sync')

type KlawEntry = {
  path: string
}

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

export function getLogsDirectory() {
  return path.join(getUserDataPath(), 'logs')
}

export function getLogFiles(): ReadonlyArray<string> {
  const directory = getLogsDirectory()
  if (!fs.existsSync(directory)) {
    return []
  }

  const entries: ReadonlyArray<KlawEntry> = klawSync(directory, { nodir: true })

  return entries.map(l => l.path).filter(item => path.extname(item) === '.log')
}
