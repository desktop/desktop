/* tslint:disable:no-sync-functions */

import * as fs from 'fs'
import * as path from 'path'
const distInfo: DistInfo = require('./dist-info')

export function getLogFiles(): ReadonlyArray<string> {
  const directory = path.join(distInfo.getUserDataPath(), 'logs')
  if (!fs.existsSync(directory)) {
    return []
  }

  const fileNames = fs.readdirSync(directory)
  return fileNames
    .filter(fileName => fileName.endsWith('.log'))
    .map(fileName => path.join(directory, fileName))
}
